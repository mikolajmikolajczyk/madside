import type { BuildDiagnostic, ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import type { VfsProvider } from '@core/vfs'
import { buildCc65, sysrootFor, type Cc65File, type Cc65Options } from './wasm/cc65-wasm'
import { parseDbg } from './cc65-dbg'
import { CC65_C_SYMBOLS } from './cc65-symbols'

/** Validate the cc65 slice of `manifest.build.options` (#51). The manifest
 *  passes the bag through untyped — the toolchain owns its schema. */
export function coerceCc65Options(
  options: Record<string, unknown> | undefined,
): { ok: true; value: Cc65Options } | { ok: false; error: string } {
  if (!options) return { ok: true, value: {} }
  const value: Cc65Options = {}
  if (options.config !== undefined) {
    if (typeof options.config !== 'string') {
      return { ok: false, error: 'build.options.config must be a string (path to a .cfg)' }
    }
    value.config = options.config
  }
  for (const key of ['cc65Args', 'ca65Args', 'ld65Args'] as const) {
    const v = options[key]
    if (v === undefined) continue
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      return { ok: false, error: `build.options.${key} must be an array of strings` }
    }
    value[key] = v as string[]
  }
  return { ok: true, value }
}

// madside machine id → cc65 compiler target (`-t`). The same id selects the
// bundled sysroot. Add a row here + bundle that target's sysroot zip to support
// another platform (#52).
// Machine id → cc65 target. Add a row (plus a sysroot zip in SYSROOT_URL) to
// support a new machine — there is deliberately NO default target, so an
// unmapped machine fails loudly instead of silently building as NES.
const CC65_TARGET: Record<string, string> = {
  nes: 'nes',
  'atari-xl': 'atari',
}
const targetFor = (machine?: string): string | undefined => CC65_TARGET[machine ?? '']

// cc65 toolchain — the C compiler + ca65 assembler + ld65 linker for the 6502,
// shipped as WASI wasm (see wasm/cc65-wasm.ts). Second ToolchainPlugin after
// MADS (#1). Multi-target: a project of `.c` / `.s` links against the bundled
// cc65 runtime for the active machine's target — NES (iNES ROM, nes.lib/nes.cfg)
// or Atari (`.xex`, atari.lib/atari.cfg).

// The three tools report two different location formats:
//   - cc65 (the C compiler): gcc-style `<file>:<line>[:<col>]: Error: <msg>`
//   - ca65 / ld65:           `<file>(<line>): Error: <msg>`
// Accept both, with an optional leading `[tool]` prefix (added by the runner,
// only on the first line of a multi-line block). Parsed into structured
// diagnostics (#29) so the editor marks the offending lines, same as MADS.
const DIAG_RE =
  /^(?:\[(?:cc65|ca65|ld65)\]\s*)?(.+?)(?:\((\d+)\)|:(\d+))(?::\d+)?:\s*(Error|Warning):\s*(.*)$/i
// CSI SGR colour codes (ld65 emits raw ANSI) — strip before parsing/display.
// eslint-disable-next-line no-control-regex -- ESC is the literal we must match
const ANSI_RE = /\x1b\[[0-9;]*m/g
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '')

export function parseDiagnostics(stdout: string, stderr: string): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = []
  const seen = new Set<string>()
  for (const raw of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const m = DIAG_RE.exec(stripAnsi(raw).trim())
    if (!m) continue
    const file = m[1].trim()
    const line = Number(m[2] ?? m[3])
    if (!Number.isFinite(line) || line < 1) continue
    const severity = m[4].toLowerCase() === 'error' ? 'error' : 'warning'
    const message = m[5].trim()
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
    const target = targetFor(machine)
    return target ? sysrootFor(target) : undefined
  },

  async build(input): Promise<ToolchainBuildOutput> {
    const files: Cc65File[] = input.files.map((f) => ({ path: f.path, content: f.content }))
    const optsResult = coerceCc65Options(input.options)
    if (!optsResult.ok) {
      return { ok: false, stdout: '', stderr: `project.json: ${optsResult.error}`, exitCode: 1 }
    }
    const target = targetFor(input.machine)
    if (!target) {
      const supported = Object.keys(CC65_TARGET).join(', ')
      return {
        ok: false,
        stdout: '',
        stderr: `cc65: no target for machine '${input.machine ?? '(none)'}' — cc65 supports: ${supported}`,
        exitCode: 1,
      }
    }
    const r = await buildCc65(input.main, files, target, optsResult.value)
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
    // Parse the cc65 debug-info file into a SourceMap + labels so the editor
    // gets PC-line highlight, gutter addresses, and line breakpoints — on C
    // lines too (#49). Keyed by the project's own source paths.
    const parsed = r.dbg ? parseDbg(r.dbg, files.map((f) => f.path)) : undefined
    return {
      ok: true,
      binary: r.binary,
      sourceMap: parsed?.sourceMap,
      labels: parsed?.labels,
      stdout: r.stdout,
      stderr: r.stderr,
      diagnostics,
      exitCode: 0,
    }
  },
}
