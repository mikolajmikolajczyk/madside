import type { ToolchainBuildOutput, ToolchainPlugin } from "@ports";
import { assemble, type SourceFile } from "./wasm-clownassembler";
import { parseListingLabels } from "./labParser";
import { parseListingSourceMap } from "./sourceMap";
import { parseClownDiagnostics } from "./diagnostics";

// clownassembler — Clownacy's AGPLv3+ Motorola 68000 assembler (asm68k/SN-68k
// syntax), the Sega Genesis/Mega Drive toolchain (#145). Wraps the
// @madside/wasm-clownassembler blob behind the ToolchainPlugin contract; emits a
// flat M68k binary + labels + a line↔address source map parsed from the listing.
export const clownassemblerToolchain: ToolchainPlugin = {
  kind: "toolchain",
  id: "clownassembler",
  name: "clownassembler (M68k)",
  inputExt: ["asm", "s", "68k", "i", "x68"],
  outputExt: "bin",

  // M68k opcodes come from the machine CPU; these are the asm68k-style directives
  // + comment marker the editor pairs with them.
  language: {
    directives: [
      "dc", "dcb", "ds", "equ", "set", "org", "rorg", "even", "align", "cnop",
      "rept", "endr", "macro", "endm", "if", "else", "endif", "elseif", "endc",
      "include", "incbin", "section", "rsset", "rs", "rsreset", "obj", "objend",
      "pushp", "popp", "even",
    ],
    lineComment: ";",
    snippets: [
      {
        label: "macro",
        detail: "macro skeleton",
        template: "${1:name}: macro\n\t${2:; body}\n\tendm\n",
      },
      {
        label: "dbra-loop",
        detail: "dbra countdown loop",
        template: "\tmove.w\t#${1:count}-1,d${2:0}\n${3:loop}:\n\t${4:; body}\n\tdbra\td${2:0},${3:loop}\n",
      },
      {
        label: "vint-wait",
        detail: "wait for a vblank flag",
        template: "${1:wait}:\n\ttst.b\t${2:vblank_flag}\n\tbeq\t${1:wait}\n",
      },
    ],
  },

  async build(input): Promise<ToolchainBuildOutput> {
    const sources: SourceFile[] = input.files.map((f) => ({ path: f.path, content: f.content }));
    const rawArgs = (input.options as { args?: unknown } | undefined)?.args;
    const userArgs = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === "string") : [];
    const r = await assemble(input.main, sources, userArgs);
    const diagnostics = parseClownDiagnostics(r.stdout, r.stderr);

    if (!r.ok || !r.binary) {
      return {
        ok: false,
        stdout: r.stdout,
        stderr: r.stderr,
        diagnostics,
        exitCode: r.exitCode !== 0 ? r.exitCode : 1,
      };
    }

    const labels = r.listing ? parseListingLabels(r.listing) : undefined;
    const sourceMap = r.listing ? parseListingSourceMap(r.listing, sources, input.main) : undefined;
    return {
      ok: true,
      binary: r.binary,
      stdout: r.stdout,
      stderr: r.stderr,
      labels,
      sourceMap,
      diagnostics,
      extras: r.listing ? { lst: r.listing } : undefined,
      exitCode: r.exitCode,
    };
  },
};
