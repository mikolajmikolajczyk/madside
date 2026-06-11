// Parses MADS `-t:` label dump into a Map<symbol, addr>.
// MADS line shape is loose; we accept any line ending in
// "  <4-hex>  <identifier>" with optional bank/state prefix.

const LINE_RE = /(?:^|\s)([0-9A-Fa-f]{4})\s+([A-Za-z_][A-Za-z0-9_.]*)\s*$/;

export function parseLabFile(lab: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of lab.split(/\r?\n/)) {
    const m = LINE_RE.exec(raw);
    if (!m) continue;
    const addr = parseInt(m[1], 16);
    const name = m[2];
    if (!out.has(name)) out.set(name, addr);
  }
  return out;
}
