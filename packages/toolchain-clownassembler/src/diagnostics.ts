import type { BuildDiagnostic } from "@ports";

// clownassembler prints each diagnostic across two lines:
//
//   Error: syntax error, unexpected '@', expecting end of file
//   On line 2 of '/main.asm'...
//
// The head carries severity + message; the next line carries line + file. Heads
// without a location (e.g. "Error: Could not assemble.") are dropped — the full
// text still reaches the Output panel.
const HEAD_RE = /^(Error|Warning):\s*(.*)$/;
const LOC_RE = /^On line (\d+) of '(.+?)'/;

export function parseClownDiagnostics(stdout: string, stderr: string): BuildDiagnostic[] {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/);
  const out: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const h = HEAD_RE.exec(lines[i]!.trim());
    if (!h) continue;
    const severity = h[1] === "Error" ? "error" : "warning";
    const message = h[2]!.trim();
    let line = 0;
    let file = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const l = LOC_RE.exec(lines[j]!.trim());
      if (l) { line = Number(l[1]); file = l[2]!.replace(/^\/+/, ""); break; }
    }
    if (line < 1 || !file) continue;
    const key = `${file}:${line}:${severity}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, line, severity, message });
  }
  return out;
}
