import type { BuildDiagnostic } from '@ports'

// Parse MADS error/warning lines into structured diagnostics (#29). MADS prints
// one diagnostic per line in the form:
//
//   main.a65 (12) ERROR: Undeclared label A
//   lib/util.a65 (5) WARNING: ...
//
// The file path is whatever MADS was handed (project-relative, since the build
// passes `-i:.`). Lines that don't match are ignored — the full text still
// reaches the Output panel untouched.
const LINE_RE = /^(.+?)\s*\((\d+)\)\s*(ERROR|WARNING):\s*(.*)$/

export function parseMadsDiagnostics(stdout: string, stderr: string): BuildDiagnostic[] {
  const out: BuildDiagnostic[] = []
  const seen = new Set<string>()
  for (const raw of `${stdout}\n${stderr}`.split(/\r?\n/)) {
    const m = LINE_RE.exec(raw.trim())
    if (!m) continue
    const file = m[1].trim()
    const line = Number(m[2])
    if (!Number.isFinite(line) || line < 1) continue
    const severity = m[3] === 'ERROR' ? 'error' : 'warning'
    const message = m[4].trim()
    // MADS repeats the same diagnostic across passes; dedupe identical entries.
    const key = `${file}:${line}:${severity}:${message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ file, line, severity, message })
  }
  return out
}
