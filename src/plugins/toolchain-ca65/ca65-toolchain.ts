import type { BuildDiagnostic, ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import { buildCc65, type Cc65File } from './wasm/cc65-wasm'

// cc65 toolchain — the C compiler + ca65 assembler + ld65 linker for the 6502,
// shipped as WASI wasm (see wasm/cc65-wasm.ts). Second ToolchainPlugin after
// MADS (#1). Targets the NES: a project of `.c` / `.s` builds to an iNES ROM,
// linked against the bundled cc65 NES runtime (nes.lib + nes.cfg).

// cc65, ca65 and ld65 all report `<file>(<line>): Error: <msg>` /
// `Warning: <msg>`. Parse them into structured diagnostics (#29) so the editor
// can mark the offending lines, same as MADS.
const DIAG_RE = /^\[(?:cc65|ca65|ld65)\]\s*(.+?)\((\d+)\):\s*(Error|Warning):\s*(.*)$/i

export function parseDiagnostics(stdout: string, stderr: string): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = []
  const seen = new Set<string>()
  for (const raw of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const m = DIAG_RE.exec(raw.trim())
    if (!m) continue
    const file = m[1].trim()
    const line = Number(m[2])
    if (!Number.isFinite(line) || line < 1) continue
    const severity = m[3].toLowerCase() === 'error' ? 'error' : 'warning'
    const message = m[4].trim()
    const key = `${file}:${line}:${severity}:${message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ file, line, severity, message })
  }
  return out
}

export const cc65Toolchain: ToolchainPlugin = {
  kind: 'toolchain',
  id: 'cc65',
  name: 'cc65 (C / ca65 / ld65)',
  // C plus the ca65 assembly family; headers/includes travel with the project.
  inputExt: ['c', 's', 'asm', 'h', 'inc'],
  outputExt: 'nes',

  async build(input): Promise<ToolchainBuildOutput> {
    const files: Cc65File[] = input.files.map((f) => ({ path: f.path, content: f.content }))
    const r = await buildCc65(input.main, files)
    const diagnostics = parseDiagnostics(r.stdout, r.stderr)
    if (!r.ok || !r.binary) {
      return {
        ok: false,
        stdout: r.stdout,
        stderr: r.stderr,
        diagnostics,
        exitCode: r.exitCode !== 0 ? r.exitCode : 1,
      }
    }
    return {
      ok: true,
      binary: r.binary,
      stdout: r.stdout,
      stderr: r.stderr,
      diagnostics,
      exitCode: 0,
    }
  },
}
