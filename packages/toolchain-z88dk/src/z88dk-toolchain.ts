import type { BuildDiagnostic, ToolchainBuildOutput, ToolchainPlugin } from '@ports'
import type { VfsProvider } from '@core/vfs'
import { buildZ88dk, buildZ88dkC, sysrootFor, type Z88dkFile, type Z88dkOptions } from './wasm/z88dk-wasm'
import { parseZ80asmDebug } from './z80asm-debug'

/** Validate the z88dk slice of `manifest.build.options`. The manifest passes the
 *  bag through untyped — the toolchain owns its schema. */
export function coerceZ88dkOptions(
  options: Record<string, unknown> | undefined,
): { ok: true; value: Z88dkOptions } | { ok: false; error: string } {
  if (!options) return { ok: true, value: {} }
  const value: Z88dkOptions = {}
  for (const key of ['org', 'snaSp'] as const) {
    const v = options[key]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffff) {
      return { ok: false, error: `build.options.${key} must be an integer in 0..65535` }
    }
    value[key] = v
  }
  if (options.z80asmArgs !== undefined) {
    const v = options.z80asmArgs
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      return { ok: false, error: 'build.options.z80asmArgs must be an array of strings' }
    }
    value.z80asmArgs = v as string[]
  }
  return { ok: true, value }
}

// madside machine id → z88dk target (`+zx`). No default — an unmapped machine
// fails loudly instead of silently assembling for the wrong platform. (The asm
// path builds the .sna in JS, so the target is conceptual today; it pins which
// machines this toolchain claims + is where appmake's `+target` will plug in.)
const Z88DK_TARGET: Record<string, string> = {
  'zx-spectrum': '+zx',
}
export const targetFor = (machine?: string): string | undefined => Z88DK_TARGET[machine ?? '']

// Both tools report `<file>:<line>[:<col>]: [fatal ]error|warning: <msg>`:
// z80asm omits the column, sccz80 includes it (and can say `fatal error`). The
// path may be VFS-absolute (leading '/'); an optional `[tool]` runner prefix can
// lead the line. Parsed into structured diagnostics (#29) so the editor marks the
// offending lines, same as cc65/MADS.
const DIAG_RE = /^(?:\[\w+\]\s*)?(.+?):(\d+)(?::\d+)?:\s*(?:fatal\s+)?(error|warning):\s*(.*)$/i

export function parseDiagnostics(stdout: string, stderr: string): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = []
  const seen = new Set<string>()
  for (const raw of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const m = DIAG_RE.exec(raw.trim())
    if (!m) continue
    const file = m[1].trim().replace(/^\/+/, '') // VFS-absolute → project-relative
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

// z88dk toolchain — z80asm + the C driver (zcc) shipped as WASI wasm
// (wasm/*.wasm, built by `just build-z88dk-wasm` + `just build-z88dk-c`). Second
// non-6502 toolchain (epic #79). Two entry paths, both producing a 48K .sna the
// chips zx core boots: a `.asm` project assembles directly; a `.c` project runs
// the full z88dk C chain (zcc → ucpp → sccz80 → z80asm + crt0/clibs link) over
// the bundled +zx sysroot, with zcc's system() shimmed to a host dispatcher (#87).

export const z88dkToolchain: ToolchainPlugin = {
  kind: 'toolchain',
  id: 'z88dk',
  name: 'z88dk (z80asm)',
  inputExt: ['asm', 's', 'inc', 'c', 'h'],
  // The build emits a 48K .sna (the bootable format for the chips zx core).
  outputExt: 'sna',

  // z80asm editor language for ZX asm. Directives are bare words (no leading
  // dot); the Z80 opcode set comes from the machine CPU (@core/cpu z80).
  language: {
    directives: [
      'org', 'defb', 'db', 'defw', 'dw', 'defs', 'ds', 'defm', 'defc', 'equ',
      'include', 'incbin', 'binary', 'module', 'section', 'public', 'extern',
      'global', 'macro', 'endm', 'rept', 'endr', 'if', 'else', 'endif', 'ifdef',
      'ifndef', 'align', 'end',
    ],
    lineComment: ';',
    snippets: [
      { label: 'org', detail: 'set origin', template: 'org $${1:8000}\n' },
      { label: 'macro', detail: 'z80asm macro', template: 'macro ${1:name}\n        ${2:; body}\nendm\n' },
      { label: 'defb', detail: 'define bytes', template: 'defb ${1:0}\n' },
    ],
  },

  // The bundled +zx C runtime + headers (read-only) the build mounts. Surfacing
  // the same provider here lets the file tree's system view (#50, ADR-0008) show
  // exactly what links — what a C source may #include — same as cc65/NES.
  sysroot(machine?: string): VfsProvider | undefined {
    const target = targetFor(machine)
    return target ? sysrootFor(target) : undefined
  },

  async build(input): Promise<ToolchainBuildOutput> {
    const optsResult = coerceZ88dkOptions(input.options)
    if (!optsResult.ok) {
      return { ok: false, stdout: '', stderr: `project.json: ${optsResult.error}`, exitCode: 1 }
    }
    if (!targetFor(input.machine)) {
      const supported = Object.keys(Z88DK_TARGET).join(', ')
      return {
        ok: false,
        stdout: '',
        stderr: `z88dk: no target for machine '${input.machine ?? '(none)'}' — z88dk supports: ${supported}`,
        exitCode: 1,
      }
    }
    const files: Z88dkFile[] = input.files.map((f) => ({ path: f.path, content: f.content }))
    // .c entry → full C path (zcc + crt0 + clibs link); .asm → asm-first snapshot.
    // The 128K machine banks SECTIONs into RAM banks + emits a .z80 (ADR-0014).
    const isC = /\.c$/i.test(input.main)
    const banked = input.machine === 'zx128'
    const r = isC
      ? await buildZ88dkC(input.main, files, optsResult.value)
      : await buildZ88dk(input.main, files, optsResult.value, banked)
    const diagnostics = parseDiagnostics(r.stdout, r.stderr)
    if (!r.ok || !r.binary) {
      return { ok: false, stdout: r.stdout, stderr: r.stderr, diagnostics, exitCode: r.exitCode !== 0 ? r.exitCode : 1 }
    }
    // Source-level debugging (#87): the asm path emits a z80asm list + map, which
    // we parse into line↔addr + labels so ZX gets the same gutter / source
    // breakpoints / current-line as the cc65 + MADS toolchains.
    const dbg = r.lis && r.map
      ? parseZ80asmDebug(r.lis, r.map, input.files.map((f) => f.path))
      : undefined
    return {
      ok: true,
      binary: r.binary,
      sourceMap: dbg?.sourceMap,
      labels: dbg?.labels,
      stdout: r.stdout,
      stderr: r.stderr,
      diagnostics,
      exitCode: 0,
    }
  },
}
