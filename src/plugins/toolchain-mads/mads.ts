import type { ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import { assemble, parseLabFile, parseSourceMap, type SourceFile } from './wasm-mads'

// MADS toolchain — Tomasz Biela's 6502 assembler shipped as @adapters/wasm-mads
// + the listing parser. Wrapped here as the first ToolchainPlugin so v0.5.0
// BuildService can dispatch via PluginRegistry instead of importing the
// adapter directly.

export const madsToolchain: ToolchainPlugin = {
  id: 'mads',
  name: 'Mad-Assembler (MADS)',
  inputExt: ['a65', 'asm', 'inc'],
  outputExt: 'xex',

  async build(input): Promise<ToolchainBuildOutput> {
    const sources: SourceFile[] = input.files.map((f) => ({
      path: f.path,
      content: f.content,
    }))
    // MADS resolves icl directives relative to the project root. Pass -i:. so
    // the assembler treats the virtual FS root as the include base.
    const r = await assemble(input.main, sources, ['-i:.'])
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
      sourceMap: r.lst ? parseSourceMap(r.lst) : undefined,
      labels,
      extras: { lst: r.lst, lab: r.lab },
      exitCode: r.exitCode,
    }
  },
}
