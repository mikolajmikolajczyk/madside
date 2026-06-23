// Parse `name → address` from a clownassembler listing (.lst). The listing prints
// a label definition on its own line as the address followed by whitespace and the
// label (no byte columns):
//
//   00000000                            start:
//   00000000 303C 1234                  \tmove.w\t#$1234,d0
//   00000004                            loop:
//
// An instruction line has hex byte columns right after the address (starting with
// a hex digit / uppercase pair), so it never matches: the label rule requires an
// identifier (letter/_/./@) immediately followed by `:`.
const LABEL_RE = /^([0-9A-Fa-f]{8})\s+([A-Za-z_.@][\w.$@]*):/;

export function parseListingLabels(listing: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of listing.split(/\r?\n/)) {
    const m = LABEL_RE.exec(line);
    if (m) out.set(m[2], parseInt(m[1], 16));
  }
  return out;
}
