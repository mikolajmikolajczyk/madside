// POSIX-style path utilities for the VFS. Project paths use `/` separators
// (never leading slashes); `basename` also tolerates Windows `\` since
// MADS `.lst` may emit them on the `Source:` marker.

export function basename(p: string): string {
  const cleaned = p.replace(/\\/g, "/").trim();
  const i = cleaned.lastIndexOf("/");
  return i >= 0 ? cleaned.slice(i + 1) : cleaned;
}

export function dirname(p: string): string {
  const cleaned = p.replace(/\\/g, "/");
  const i = cleaned.lastIndexOf("/");
  return i >= 0 ? cleaned.slice(0, i) : "";
}

/** Lowercase extension without the leading dot, or "" when none. */
export function extOf(p: string): string {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return "";
  return p.slice(dot + 1).toLowerCase();
}
