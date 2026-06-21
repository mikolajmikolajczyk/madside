// Pure parser for cc65 / ca65 / ld65 build output → structured diagnostics.
// Reusable by any host (the LSP publishes them; a host with its own UI can too).
// Output is line/column as the toolchain emits it (1-based), NOT engine offsets:
// the compiler reports line/col and the pure parser has no file text to convert
// against — the LSP/editor maps these to a 0-based Range. That's a transport
// concern, kept out of here like every other position-conversion in the engine.

import type { CDiagnostic, CDiagnosticSeverity } from './types'

const normalizeSeverity = (raw: string): CDiagnosticSeverity => {
  const s = raw.toLowerCase()
  if (s.startsWith('warn')) return 'warning'
  if (s.startsWith('note')) return 'note'
  return 'error' // "error" and "fatal error"
}

// gcc-style, as cc65 emits with no leading tag: `file:line[:col]: severity: msg`.
const GCC_RE = /^(.+?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.*)$/i

// cc65/ca65 native style: `file(line): Severity: msg`.
const CC65_RE = /^(.+?)\((\d+)\):\s*(Error|Warning|Note):\s*(.*)$/i

/** Parse gcc/cc65-style build output into structured diagnostics. Lines that
 *  match neither form (banners, linker notes, blank lines) are ignored. */
export function parseBuildOutput(output: string): CDiagnostic[] {
  const out: CDiagnostic[] = []
  for (const line of output.split(/\r?\n/)) {
    const gcc = GCC_RE.exec(line)
    if (gcc) {
      const [, file = '', ln = '0', col, sev = '', msg = ''] = gcc
      out.push({
        file,
        line: Number(ln),
        column: col ? Number(col) : 1,
        severity: normalizeSeverity(sev),
        message: msg.trim(),
      })
      continue
    }
    const cc65 = CC65_RE.exec(line)
    if (cc65) {
      const [, file = '', ln = '0', sev = '', msg = ''] = cc65
      out.push({
        file,
        line: Number(ln),
        column: 1,
        severity: normalizeSeverity(sev),
        message: msg.trim(),
      })
    }
  }
  return out
}
