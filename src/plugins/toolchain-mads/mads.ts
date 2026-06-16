import type { ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import { MADS_DIRECTIVES } from '@core'
import { assemble, parseLabFile, parseSourceMap, type SourceFile } from './wasm-mads'

// MADS toolchain — Tomasz Biela's 6502 assembler shipped as @adapters/wasm-mads
// + the listing parser. Wrapped here as the first ToolchainPlugin so v0.5.0
// BuildService can dispatch via PluginRegistry instead of importing the
// adapter directly.

export const madsToolchain: ToolchainPlugin = {
  kind: 'toolchain',
  id: 'mads',
  name: 'Mad-Assembler (MADS)',
  inputExt: ['a65', 'asm', 'inc'],
  outputExt: 'xex',

  // Editor language (epic 78b12bf). 6502 opcodes come from the machine CPU;
  // these are the MADS-specific directives, comment markers, and snippets.
  language: {
    directives: [...MADS_DIRECTIVES],
    lineComment: [';', '//'],
    snippets: [
      {
        label: 'loop-y',
        detail: 'ldy loop body',
        template: '        ldy #0\n${1:loop}\n        ${2:; body}\n        iny\n        cpy #${3:length}\n        bne ${1:loop}\n',
      },
      {
        label: 'loop-x',
        detail: 'ldx loop body',
        template: '        ldx #0\n${1:loop}\n        ${2:; body}\n        inx\n        cpx #${3:length}\n        bne ${1:loop}\n',
      },
      {
        label: 'wait-vbl',
        detail: 'wait for vertical blank',
        template: '${1:wait}\n        lda RTCLOK+2\n        cmp RTCLOK+2\n        beq ${1:wait}\n',
      },
      {
        label: 'ptr-set',
        detail: 'load 16-bit pointer to zero page',
        template: '        lda #<${1:label}\n        sta ${2:ptr}\n        lda #>${1:label}\n        sta ${2:ptr}+1\n',
      },
      {
        label: 'sub-template',
        detail: 'subroutine skeleton',
        template: '${1:name}\n        ${2:; body}\n        rts\n',
      },
      {
        label: 'program',
        detail: 'minimal program skeleton',
        template: "        icl 'atari.a65'\n        org $${1:2000}\n\nstart\n        ${2:; main}\n        jmp *\n\n        run start\n",
      },
    ],
  },

  async build(input): Promise<ToolchainBuildOutput> {
    const sources: SourceFile[] = input.files.map((f) => ({
      path: f.path,
      content: f.content,
    }))
    // MADS resolves icl directives relative to the project root. Pass -i:. so
    // the assembler treats the virtual FS root as the include base, then any
    // raw args from manifest.build.args (e.g. extra -i: paths, -d:SYM=val).
    const rawArgs = (input.options as { args?: unknown } | undefined)?.args
    const userArgs = Array.isArray(rawArgs) ? rawArgs.filter((a): a is string => typeof a === 'string') : []
    const r = await assemble(input.main, sources, ['-i:.', ...userArgs])
    // Build the text-decoded file map once for the source-map reconstructor —
    // it scans icl directives in parent files to disambiguate same-basename
    // includes (e.g. src/main.a65 + lib/main.a65).
    const fileMap = new Map<string, string>()
    const decoder = new TextDecoder()
    for (const f of input.files) {
      if (typeof f.content === 'string') fileMap.set(f.path, f.content)
      else fileMap.set(f.path, decoder.decode(f.content))
    }
    if (!r.ok || !r.xex) {
      // MADS occasionally exits 0 even when it failed to emit a binary
      // (parse errors during pass 2, missing labels reported as warnings).
      // Force a non-zero code so the contract holds: failure ⇒ exitCode ≠ 0.
      const exitCode = r.exitCode !== 0 ? r.exitCode : 1
      return {
        ok: false,
        stdout: r.stdout,
        stderr: r.stderr,
        exitCode,
      }
    }
    let labels: Map<string, number> | undefined
    if (r.lab) {
      labels = new Map<string, number>()
      for (const [name, addr] of parseLabFile(r.lab)) labels.set(name, addr)
    }
    return {
      ok: true,
      binary: r.xex,
      stdout: r.stdout,
      stderr: r.stderr,
      sourceMap: r.lst ? parseSourceMap(r.lst, { main: input.main, files: fileMap }) : undefined,
      labels,
      extras: { lst: r.lst, lab: r.lab },
      exitCode: r.exitCode,
    }
  },
}
