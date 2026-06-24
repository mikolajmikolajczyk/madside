// Parses MADS .lst output into addr↔line maps.
//
// MADS .lst line shapes we care about:
//   "   126 D800 20 A1 DB			jsr		skpspc"   ← emitted code (lineno, addr, bytes...)
//   "    23 = 0000				_KERNEL_PBI_SUPPORT = 0"   ← equate (no addr in map)
//   "    10 				;==="                            ← comment / non-emitting (skip)
//
// Source file context: header "Source: source/main.xasm". When MADS includes,
// it emits another "Source: <name>" marker. MADS strips the path — only the
// basename appears in `Source:` lines. To uniquely identify files in projects
// that have multiple files with the same basename (`src/main.a65` +
// `lib/main.a65`), the parser reconstructs the full project-relative path by
// walking icl directives in the parent file. Callers supply `files` (path →
// content) + `main` for resolution; when omitted, the parser falls back to
// basename keys (back-compat).

// Canonical shape lives in @ports/source-map. Adapter still re-exports the
// names so call sites that go through @adapters/wasm-mads keep compiling.
export type { SourceLoc, SourceMap } from "@ports";

import type { SourceLoc, SourceMap } from "@ports";
import { basename, dirname } from "@core/path";

const SOURCE_RE = /^Source:\s*(.+?)\s*$/;
const LINENO_RE = /^\s*(\d+)\s/;
// MADS prefix tokens before code bytes: "XXXX>", "XXXX-XXXX>", or plain "XXXX " (4 hex + space).
// Multiple may chain (e.g. line "8 FFFF> 2000-2019> A5 58 ...").
// When a memory bank is active (bank != 0) MADS prefixes the address with the
// 2-hex bank + comma: "01,2000", "01,2000-2008>" (bank 0 emits no prefix). The
// optional bank is captured for banking-support groundwork (ADR-0014 Phase 0).
// Capture groups: 1 = optional bank, 2 = start addr, 3 = optional end addr (range), 4 = optional ">" marker.
const PREFIX_RE = /^(?:([0-9A-Fa-f]{2}),)?([0-9A-Fa-f]{4})(?:-([0-9A-Fa-f]{4}))?(>)?\s+/;
// Byte sequence: one or more 2-hex tokens separated by whitespace.
const BYTES_RE = /^((?:[0-9A-Fa-f]{2}\s+)+)/;
// Equate line "= XXXX label = value" — no emission.
const EQUATE_RE = /^=\s+[0-9A-Fa-f]{4}/;
// icl directive in MADS source: `icl 'path'` or `icl "path"`.
const ICL_RE = /^\s*icl\s+['"]([^'"]+)['"]/i;

interface LstCode { lineno: number; addr: number; bytes: number; bank: number | null; }

function parseCodeLine(s: string): LstCode | null {
  const lm = LINENO_RE.exec(s);
  if (!lm) return null;
  let rest = s.slice(lm[0].length);
  if (EQUATE_RE.test(rest)) return null;
  let addr: number | null = null;
  let rangeEnd: number | null = null;
  let bank: number | null = null;
  let pm: RegExpExecArray | null;
  // Walk through every prefix on the line — the *last* one wins for the actual
  // emission address. `FFFF>` placeholders (forward references / org markers)
  // before a real "XXXX-YYYY>" range are intentionally overwritten. The bank (when
  // present) rides with the winning address.
  while ((pm = PREFIX_RE.exec(rest))) {
    bank = pm[1] != null ? parseInt(pm[1], 16) : null;
    addr = parseInt(pm[2], 16);
    rangeEnd = pm[3] ? parseInt(pm[3], 16) : null;
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
  return { lineno: parseInt(lm[1], 10), addr, bytes, bank };
}

export interface ParseSourceMapContext {
  /** POSIX path of the entry file (`manifest.main`). Used to seed the include
   *  stack with the first `Source:` line. */
  main: string;
  /** Project files indexed by full POSIX path. The parser scans them to
   *  resolve icl targets when the same basename appears in multiple folders. */
  files: ReadonlyMap<string, string>;
}

/** Resolve an icl target (verbatim string from `icl '...'`) to a full
 *  project-relative path. Search order:
 *  1. As-is if it exists in files.
 *  2. Relative to parent file's directory.
 *  3. First file matching the basename. */
function resolveIcl(
  iclTarget: string,
  parentPath: string,
  files: ReadonlyMap<string, string>,
): string {
  if (files.has(iclTarget)) return iclTarget;
  const parentDir = dirname(parentPath);
  const sameDir = parentDir ? `${parentDir}/${iclTarget}` : iclTarget;
  if (files.has(sameDir)) return sameDir;
  const name = basename(iclTarget);
  for (const p of files.keys()) {
    if (basename(p) === name) return p;
  }
  return iclTarget;
}

/** Find the most recent icl directive in `parentContent` (up to and
 *  including line `maxLine`) whose target basename matches `name`. Returns
 *  the resolved full path, or null when no icl matches. */
function reconstructIncludePath(
  name: string,
  parentPath: string,
  parentContent: string,
  maxLine: number,
  files: ReadonlyMap<string, string>,
): string | null {
  const lines = parentContent.split(/\r?\n/);
  const cap = Math.min(maxLine, lines.length);
  for (let i = cap - 1; i >= 0; i--) {
    const m = ICL_RE.exec(lines[i]);
    if (!m) continue;
    if (basename(m[1]) !== name) continue;
    return resolveIcl(m[1], parentPath, files);
  }
  return null;
}

export function parseSourceMap(lst: string, ctx?: ParseSourceMapContext): SourceMap {
  const addrToLoc = new Map<number, SourceLoc>();
  const locToAddr = new Map<string, Map<number, number>>();
  // Banked builds only (ADR-0014 Phase 1): every loc per addr across banks, so
  // same-addr lines in different banks stay distinguishable. Stays empty/absent
  // for flat builds.
  const bankedAddrToLoc = new Map<number, SourceLoc[]>();

  // Stack of include frames. MADS emits "Source: foo" when entering icl,
  // but does NOT re-emit parent when leaving. Heuristic: when a new line
  // number is lower than the current frame's last seen line, the include
  // ended — pop until line fits.
  const stack: { file: string; lastLine: number }[] = [];
  const pushFile = (file: string) => {
    if (!locToAddr.has(file)) locToAddr.set(file, new Map());
    stack.push({ file, lastLine: 0 });
  };

  const resolveSourceLine = (name: string): string => {
    if (!ctx) return basename(name);
    if (stack.length === 0) return ctx.main;
    const parent = stack[stack.length - 1];
    const parentContent = ctx.files.get(parent.file);
    if (!parentContent) return basename(name);
    const fromIcl = reconstructIncludePath(basename(name), parent.file, parentContent, parent.lastLine || lines(parentContent), ctx.files);
    return fromIcl ?? resolveIcl(name, parent.file, ctx.files);
  };

  for (const rawLine of lst.split(/\r?\n/)) {
    const srcMatch = SOURCE_RE.exec(rawLine);
    if (srcMatch) {
      pushFile(resolveSourceLine(srcMatch[1]));
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
    const { lineno: line, addr, bytes, bank } = code;
    const currentFile = stack[stack.length - 1].file;

    for (let i = 0; i < bytes; i++) {
      const a = (addr + i) & 0xffff;
      // Banking (ADR-0014): capture the bank when MADS emitted one. MADS gives
      // no physical offset (unlike cc65's `ooffs`), so only `space` is set.
      const loc: SourceLoc = { file: currentFile, line };
      if (bank != null) loc.space = `bank${bank}`;
      if (!addrToLoc.has(a)) addrToLoc.set(a, loc);
      // Banked bytes also go into the multi-loc index so same-addr lines in
      // other banks aren't lost to the first-wins addrToLoc above (Phase 1).
      if (bank != null) {
        const list = bankedAddrToLoc.get(a);
        if (list) list.push(loc);
        else bankedAddrToLoc.set(a, [loc]);
      }
    }
    const fileMap = locToAddr.get(currentFile)!;
    if (!fileMap.has(line)) fileMap.set(line, addr);
  }

  return bankedAddrToLoc.size > 0
    ? { addrToLoc, locToAddr, bankedAddrToLoc }
    : { addrToLoc, locToAddr };
}

function lines(content: string): number {
  // Cap used when we have a Source: but haven't yet seen any line numbers
  // inside the parent — scan the whole parent. Rare but possible at the very
  // top of the file.
  return content.split(/\r?\n/).length;
}
