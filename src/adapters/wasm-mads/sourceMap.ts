// Parses MADS .lst output into addr↔line maps.
//
// MADS .lst line shapes we care about:
//   "   126 D800 20 A1 DB			jsr		skpspc"   ← emitted code (lineno, addr, bytes...)
//   "    23 = 0000				_KERNEL_PBI_SUPPORT = 0"   ← equate (no addr in map)
//   "    10 				;==="                            ← comment / non-emitting (skip)
//
// Source file context: header "Source: source/main.xasm". When MADS includes,
// it emits another "Source: <path>" marker. We track current file by basename.

// Canonical shape lives in @ports/source-map. Adapter still re-exports the
// names so call sites that go through @adapters/wasm-mads keep compiling.
export type { SourceLoc, SourceMap } from "@ports";

import type { SourceLoc, SourceMap } from "@ports";

const SOURCE_RE = /^Source:\s*(.+?)\s*$/;
const LINENO_RE = /^\s*(\d+)\s/;
// MADS prefix tokens before code bytes: "XXXX>", "XXXX-XXXX>", or plain "XXXX " (4 hex + space).
// Multiple may chain (e.g. line "8 FFFF> 2000-2019> A5 58 ...").
// Capture groups: 1 = start addr, 2 = optional end addr (range), 3 = optional ">" marker.
const PREFIX_RE = /^([0-9A-Fa-f]{4})(?:-([0-9A-Fa-f]{4}))?(>)?\s+/;
// Byte sequence: one or more 2-hex tokens separated by whitespace.
const BYTES_RE = /^((?:[0-9A-Fa-f]{2}\s+)+)/;
// Equate line "= XXXX label = value" — no emission.
const EQUATE_RE = /^=\s+[0-9A-Fa-f]{4}/;

interface LstCode { lineno: number; addr: number; bytes: number; }

function parseCodeLine(s: string): LstCode | null {
  const lm = LINENO_RE.exec(s);
  if (!lm) return null;
  let rest = s.slice(lm[0].length);
  if (EQUATE_RE.test(rest)) return null;
  let addr: number | null = null;
  let rangeEnd: number | null = null;
  let pm: RegExpExecArray | null;
  // Walk through every prefix on the line — the *last* one wins for the actual
  // emission address. `FFFF>` placeholders (forward references / org markers)
  // before a real "XXXX-YYYY>" range are intentionally overwritten.
  while ((pm = PREFIX_RE.exec(rest))) {
    addr = parseInt(pm[1], 16);
    rangeEnd = pm[2] ? parseInt(pm[2], 16) : null;
    rest = rest.slice(pm[0].length);
  }
  if (addr == null) return null;
  const bm = BYTES_RE.exec(rest);
  if (!bm) return null;
  const tokenCount = bm[1].trim().split(/\s+/).length;
  // `XXXX-YYYY>` is authoritative: byte count = YYYY - XXXX + 1. Falls back to
  // hex-token count when only a single addr is present.
  let bytes = tokenCount;
  if (rangeEnd != null) {
    const span = ((rangeEnd - addr) & 0xffff) + 1;
    if (span > 0 && span <= tokenCount) bytes = span;
  }
  return { lineno: parseInt(lm[1], 10), addr, bytes };
}

// MADS .lst emits `Source: leaf.a65` without the directory prefix even when we
// pass it a path like "src/leaf.a65", so source-map keys are basenames. App
// callers need to match by basename of their project path.
import { basename } from "@core/path";

export function parseSourceMap(lst: string): SourceMap {
  const addrToLoc = new Map<number, SourceLoc>();
  const locToAddr = new Map<string, Map<number, number>>();

  // Stack of include frames. MADS emits "Source: foo" when entering icl,
  // but does NOT re-emit parent when leaving. Heuristic: when a new line
  // number is lower than the current frame's last seen line, the include
  // ended — pop until line fits.
  const stack: { file: string; lastLine: number }[] = [];
  const pushFile = (file: string) => {
    if (!locToAddr.has(file)) locToAddr.set(file, new Map());
    stack.push({ file, lastLine: 0 });
  };

  for (const rawLine of lst.split(/\r?\n/)) {
    const srcMatch = SOURCE_RE.exec(rawLine);
    if (srcMatch) {
      pushFile(basename(srcMatch[1]));
      continue;
    }
    if (stack.length === 0) continue;

    // Detect any line with a leading "<num> ..." and use it for stack tracking,
    // even non-code lines, so include-pop fires reliably.
    //
    // MADS does NOT re-emit `Source: parent` when an `icl` returns. Two pop
    // heuristics:
    //   (1) lineno drops below the top frame's lastLine — clearly back in
    //       parent if the included file had higher line numbers.
    //   (2) lineno equals (parent.lastLine + 1) — the line immediately after
    //       the icl directive — handles the common case where parent's lineno
    //       picks up at icl+1 but is still higher than included file's tail.
    const lineNoMatch = /^\s*(\d+)\s/.exec(rawLine);
    if (lineNoMatch) {
      const lineno = parseInt(lineNoMatch[1], 10);
      while (stack.length > 1) {
        const top = stack[stack.length - 1];
        const parent = stack[stack.length - 2];
        if (lineno < top.lastLine) { stack.pop(); continue; }
        if (lineno === parent.lastLine + 1) { stack.pop(); continue; }
        break;
      }
      stack[stack.length - 1].lastLine = Math.max(stack[stack.length - 1].lastLine, lineno);
    }

    const code = parseCodeLine(rawLine);
    if (!code) continue;
    const { lineno: line, addr, bytes } = code;
    const currentFile = stack[stack.length - 1].file;

    for (let i = 0; i < bytes; i++) {
      const a = (addr + i) & 0xffff;
      if (!addrToLoc.has(a)) addrToLoc.set(a, { file: currentFile, line });
    }
    const fileMap = locToAddr.get(currentFile)!;
    if (!fileMap.has(line)) fileMap.set(line, addr);
  }

  return { addrToLoc, locToAddr };
}
