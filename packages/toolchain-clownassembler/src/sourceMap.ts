import type { SourceLoc, SourceMap } from "@ports";
import type { SourceFile } from "./wasm-clownassembler";

// Build a line↔address SourceMap from a clownassembler listing (#145, Phase B).
//
// The listing reproduces the assembled source in order, one listing line per
// source line, prefixed with the PC address and (for emitting lines) the byte
// columns. `include` directives are expanded *inline*, so a flat positional map
// would drift after the first include. Instead we walk each source file's lines
// in lockstep with the listing and recurse on `include`, which keeps every line
// attributed to its real (file, line) across nested includes.
//
// A listing line "emits" when an address is immediately followed by a hex byte
// column; equates (`00000000 =00000010`) and label/blank/comment lines don't, so
// only real code/data anchors an address. Long rows are truncated with a trailing
// `+` (still one listing line), so the one-line-per-source-line invariant holds.
//
// clownassembler *collapses* macro / rept expansions: each invocation, body, and
// closing directive is still exactly one listing line, so the lockstep — and so
// line-debug *outside* expansions — holds (the per-iteration bytes of a `rept`
// get folded onto the `endr` line). The one residual gap is the body itself: a
// macro-invocation line carries its address but no inline byte column (the
// expansion emitted the bytes), so EMIT_RE alone would leave the call site
// unmapped. We recover it by detecting macro names from their definitions and
// mapping each invocation line to its (correct) address — so a breakpoint on a
// macro call resolves. The per-line interior of a rept body stays approximate.

const ADDR_RE = /^([0-9A-Fa-f]{8})/;
// An address followed by a space and at least one hex byte pair => emits bytes.
const EMIT_RE = /^[0-9A-Fa-f]{8} [0-9A-Fa-f]{2}/;
// `[label[:]] include "path"` (asm68k style; label prefix is rare but allowed).
const INCLUDE_RE = /^\s*(?:[A-Za-z_.@][\w.$@]*:?\s+)?include\s+["']([^"']+)["']/i;
// `name[:] macro` — a macro definition (asm68k). Captures the macro's name.
const MACRO_DEF_RE = /^\s*([A-Za-z_.@][\w.$@]*):?\s+macro\b/i;
// First mnemonic token of a source line: skip an optional leading `label[:]`,
// then capture the next word — a macro invocation uses the macro name here.
const MNEMONIC_RE = /^\s*(?:[A-Za-z_.@][\w.$@]*:?\s+)?([A-Za-z_.@][\w.$@]*)/;

interface ListLine {
  addr: number;
  emits: boolean;
}

export function parseListingSourceMap(
  listing: string,
  files: SourceFile[],
  mainPath: string,
): SourceMap {
  const addrToLoc = new Map<number, SourceLoc>();
  const locToAddr = new Map<string, Map<number, number>>();

  // Text sources only — incbin'd binaries aren't walkable (and emit as a single
  // line of the including file anyway).
  const decoder = new TextDecoder();
  const text = new Map<string, string[]>();
  for (const f of files) {
    const content = typeof f.content === "string" ? f.content : decoder.decode(f.content);
    const lines = content.split(/\r?\n/);
    // Drop the phantom empty element a trailing newline leaves — the listing has
    // one line per real source line, so this keeps the lockstep aligned.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    text.set(f.path, lines);
  }

  const list: ListLine[] = listing.split(/\r?\n/).map((l) => {
    const m = ADDR_RE.exec(l);
    return { addr: m ? parseInt(m[1], 16) : -1, emits: EMIT_RE.test(l) };
  });

  // Macro names, collected from every source file's definitions. A source line
  // whose mnemonic is one of these is an invocation whose bytes the listing folds
  // away — we map it to its line's address even though it shows no byte column.
  const macroNames = new Set<string>();
  for (const lines of text.values()) {
    for (const l of lines) {
      const m = MACRO_DEF_RE.exec(l);
      if (m) macroNames.add(m[1]!);
    }
  }

  const record = (addr: number, path: string, lineNo: number): void => {
    if (!addrToLoc.has(addr)) addrToLoc.set(addr, { file: path, line: lineNo });
    let fileMap = locToAddr.get(path);
    if (!fileMap) {
      fileMap = new Map();
      locToAddr.set(path, fileMap);
    }
    if (!fileMap.has(lineNo)) fileMap.set(lineNo, addr);
  };

  // Resolve an include target against the known files: literal, then relative to
  // the including file's dir, then by basename.
  const resolve = (inc: string, fromPath: string): string | undefined => {
    if (text.has(inc)) return inc;
    const slash = fromPath.lastIndexOf("/");
    const dir = slash >= 0 ? fromPath.slice(0, slash + 1) : "";
    if (text.has(dir + inc)) return dir + inc;
    const base = inc.split("/").pop()!;
    for (const p of text.keys()) if (p === base || p.endsWith("/" + base)) return p;
    return undefined;
  };

  let li = 0; // listing pointer

  // DFS by source file; `seen` is a path-stack guard against include cycles (a
  // file may still be included twice on disjoint branches).
  const walk = (path: string, seen: Set<string>): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const lines = text.get(path);
    if (lines) {
      for (let n = 0; n < lines.length && li < list.length; n++) {
        const ll = list[li];
        li++;
        const incM = INCLUDE_RE.exec(lines[n]!);
        if (incM) {
          const target = resolve(incM[1]!, path);
          if (target) walk(target, seen);
          continue;
        }
        if (ll!.addr >= 0) {
          const lineNo = n + 1;
          if (ll!.emits) {
            record(ll!.addr, path, lineNo);
          } else if (macroNames.size > 0) {
            // A macro invocation emits via the (collapsed) expansion, so the line
            // has an address but no inline bytes — map it by name so the call site
            // is breakpointable.
            const mn = MNEMONIC_RE.exec(lines[n]!);
            if (mn && macroNames.has(mn[1]!)) record(ll!.addr, path, lineNo);
          }
        }
      }
    }
    seen.delete(path);
  };

  walk(mainPath, new Set());
  return { addrToLoc, locToAddr };
}
