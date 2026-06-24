import type { ToolchainBuildOutput, ToolchainPlugin } from "@ports";
import { assemble, type SourceFile } from "./wasm-clownassembler";
import { parseListingLabels } from "./labParser";
import { parseListingSourceMap } from "./sourceMap";
import { parseClownDiagnostics } from "./diagnostics";
import { assembleZ80Flat } from "@madside/toolchain-z88dk";

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

    // Composite Z80 step (#147): the Genesis Z80 sound coprocessor. When
    // `build.options.z80` is set the project's own Z80 source is assembled here
    // with z80asm into a sibling .bin the M68k source can `incbin` (the 68000
    // then copies it to the Z80's RAM at $A00000). `z80: true` builds every
    // `.s80`; `z80: "path.s80"` builds just that entry. This is the same
    // multi-tool-under-one-plugin pattern as cc65/z88dk — clownassembler IS the
    // Genesis build, internally orchestrating both assemblers.
    const z80opt = (input.options as { z80?: unknown } | undefined)?.z80;
    if (z80opt) {
      const z80files = input.files.map((f) => ({ path: f.path, content: f.content }));
      const entries = typeof z80opt === "string"
        ? [z80opt]
        : input.files.filter((f) => /\.s80$/i.test(f.path)).map((f) => f.path);
      for (const entry of entries) {
        const blob = await assembleZ80Flat(entry, z80files);
        if (!blob.ok || !blob.binary) {
          return { ok: false, stdout: "", stderr: blob.stderr, diagnostics: [], exitCode: 1 };
        }
        sources.push({ path: entry.replace(/\.s80$/i, ".bin"), content: blob.binary });
      }
    }

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
