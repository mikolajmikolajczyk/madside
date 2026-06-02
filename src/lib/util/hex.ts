// Compact hex formatting helpers — every panel that talks addresses or
// bytes needs the same thing.

export function hex(n: number, width = 0, upper = true): string {
  const s = n.toString(16).padStart(width, "0");
  return upper ? s.toUpperCase() : s;
}

/** "$XXXX" address — used by Debug panel, status bar, etc. */
export const addr16 = (n: number): string => "$" + hex(n, 4);

/** "XX" byte — uppercase 2-digit. */
export const byteHex = (n: number): string => hex(n, 2);
