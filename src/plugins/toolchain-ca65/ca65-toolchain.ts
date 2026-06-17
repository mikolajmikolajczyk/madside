import type { BuildDiagnostic, ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import type { VfsProvider } from '@core/vfs'
import { buildCc65, sysrootFor, type Cc65File } from './wasm/cc65-wasm'
import { CC65_C_SYMBOLS } from './cc65-symbols'

// madside machine id → cc65 compiler target (`-t`). The same id selects the
// bundled sysroot. Add a row here + bundle that target's sysroot zip to support
// another platform (#52).
const CC65_TARGET: Record<string, string> = {
  nes: 'nes',
  'atari-xl': 'atari',
}
const targetFor = (machine?: string) => CC65_TARGET[machine ?? ''] ?? 'nes'

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
  // Output extension varies by target (.nes / .xex); outputExt is the common
  // default. The build picks the real extension from the target.
  outputExt: 'nes',

  // ca65 editor language for .s sources (#47). Directives are bare words — the
  // editor's assembly highlighter strips the leading '.', so `.segment` matches
  // `segment` here. The 6502 opcode set comes from the machine CPU.
  language: {
    directives: [
      'segment', 'code', 'data', 'bss', 'rodata', 'zeropage', 'org', 'reloc',
      'proc', 'endproc', 'scope', 'endscope', 'macro', 'endmacro', 'mac', 'endmac',
      'struct', 'endstruct', 'union', 'endunion', 'enum', 'endenum',
      'byte', 'word', 'dword', 'addr', 'res', 'asciiz', 'dbyt',
      'import', 'importzp', 'export', 'exportzp', 'global', 'globalzp',
      'include', 'incbin', 'if', 'ifdef', 'ifndef', 'ifblank', 'ifnblank',
      'else', 'elseif', 'endif', 'repeat', 'endrepeat', 'endrep',
      'define', 'undefine', 'setcpu', 'feature', 'align', 'assert',
      'error', 'warning', 'out', 'tag', 'local', 'case', 'charmap',
      'a8', 'a16', 'i8', 'i16', 'p02', 'p816', 'autoimport', 'debuginfo',
      'forceimport', 'macpack', 'condes', 'pushseg', 'popseg',
    ],
    lineComment: ';',
    snippets: [
      { label: 'proc', detail: 'ca65 procedure', template: '.proc ${1:name}\n        ${2:; body}\n        rts\n.endproc\n' },
      { label: 'segment', detail: 'segment directive', template: '.segment "${1:CODE}"\n' },
      { label: 'macro', detail: 'ca65 macro', template: '.macro ${1:name}${2:, arg}\n        ${3:; body}\n.endmacro\n' },
    ],
    cSymbols: CC65_C_SYMBOLS,
  },

  // The bundled C runtime + headers (read-only) for the active machine's target.
  // Same provider the build mounts, so the file tree's system view (#50) shows
  // exactly what links.
  sysroot(machine?: string): VfsProvider | undefined {
    return sysrootFor(targetFor(machine))
  },

  async build(input): Promise<ToolchainBuildOutput> {
    const files: Cc65File[] = input.files.map((f) => ({ path: f.path, content: f.content }))
    const r = await buildCc65(input.main, files, targetFor(input.machine))
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
