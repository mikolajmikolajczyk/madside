#!/usr/bin/env python3
# Split the ragel action switch out of _parse_statement_1 into its own function.
# The wasm backend's FixIrreducibleControlFlow pass OOMs (~28G) on the single
# 15k-block loop body; moving the action switch (which holds ~46k of the lines)
# into a loop-free helper shrinks the driver loop and makes both functions cheap
# to compile. Reproducible post-process applied after ragel generation.
import sys, re

path = sys.argv[1] if len(sys.argv) > 1 else "src/c/parse_rules.h"
text = open(path).read()
if "_parser_exec_action" in text:        # idempotent: already split
    print("split-action-switch: already applied, skipping")
    raise SystemExit(0)
lines = text.split("\n")

def find(pat, lo=0):
    rx = re.compile(pat)
    for i in range(lo, len(lines)):
        if rx.search(lines[i]):
            return i
    raise SystemExit(f"pattern not found: {pat}")

# Anchors (0-based indices).
fn_start   = find(r"^static bool _parse_statement_1\(")
nacts_line = find(r"_nacts = \(unsigned int\) \*_acts\+\+;", fn_start)
while_line = find(r"while \( _nacts-- > 0 \)", nacts_line)
switch_line= find(r"switch \( \*_acts\+\+ \)", while_line)
sw_open    = switch_line + 1                  # the '{' after switch
again_line = find(r"^_again:", switch_line)   # first line after the while block
sw_close   = again_line - 2                   # '}' closing switch
while_close= again_line - 1                   # '}' closing while

assert lines[sw_close].strip() == "}", f"sw_close={lines[sw_close]!r}"
assert lines[while_close].strip() == "}", f"while_close={lines[while_close]!r}"
assert lines[sw_open].strip() == "{", f"sw_open={lines[sw_open]!r}"

# Action case bodies: between switch '{' and switch '}'.
body = lines[sw_open+1 : sw_close]
body = [ln.replace("goto _again;", "return 1;") for ln in body]  # fgoto actions

func = (
    ["static int _parser_exec_action(ParseCtx *ctx, Str *name, Str *stmt_label,",
     "                               int *p_expr_open_parens, int *p_value1, int _act) {",
     "#define expr_open_parens (*p_expr_open_parens)",
     "#define value1 (*p_value1)",
     "\tswitch ( _act )",
     "\t{"]
    + body +
    ["\t}",
     "#undef expr_open_parens",
     "#undef value1",
     "\treturn 0;",
     "}",
     ""]
)

call = [
    "\twhile ( _nacts-- > 0 )",
    "\t\tif ( _parser_exec_action(ctx, name, stmt_label, &expr_open_parens, &value1, *_acts++) )",
    "\t\t\tgoto _again;",
]

out = (
    lines[:fn_start]                 # everything before _parse_statement_1
    + func                           # the extracted helper
    + lines[fn_start:while_line]     # fn header .. up to (not incl) while
    + call                           # the slim while -> call
    + lines[again_line:]             # _again: onward
)
open(path, "w").write("\n".join(out))
print(f"split done: helper={len(func)} lines, body cases={len(body)} lines, "
      f"while@{while_line+1} switch@{switch_line+1} again@{again_line+1}")
