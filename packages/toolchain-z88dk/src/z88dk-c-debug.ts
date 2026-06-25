// Parse the z88dk C path's debug artifacts into a workbench SourceMap + labels,
// giving sccz80-compiled C the same source-level debugging as the asm path
// (#135). Two inputs per C object:
//
//   list (`*.lis`):  the z80asm listing of sccz80's generated asm. sccz80 emits
//     `C_LINE <n>,"<file>[::scope]"` directives; z80asm rewrites the listing's
//     line-number column to that C source line, so an emitting line reads
//     "<C-line>  <offset4>  <bytes>  <asm text>" with <offset> RELATIVE to the
//     line's SECTION (`code_compiler`). The active C FILE comes from the last
//     `C_LINE` (the listing's own file header is the temp .asm, not the .c).
//   map  (`*.map`):  the final LINK map — `__<section>_head` section bases (so a
//     section-relative offset becomes absolute) plus `NAME = $ADDR ; addr, ...,
//     <file>::<scope>:<line>` entries for each public symbol (the C functions).
//
// Absolute address = section base (from the map) + the listing's per-line offset.
// Granularity follows sccz80: at default optimisation it emits one C_LINE per
// function, so line→addr is function-grained (every instruction of a function
// maps to that function's C line) — enough for gutter addresses, breakpoints on
// function lines, and current-line highlight. Finer markers refine it for free.

import type { SourceLoc, SourceMap } from '@ports'
import { basename } from '@core/path'

const C_LINE = /^\s*C_LINE\s+(\d+)\s*,\s*"([^"]+)"/
const SECTION_LINE = /^\s*\d+\s+SECTION\s+(\S+)/
const CODE_LINE = /^\s*(\d+)\s+([0-9A-Fa-f]{4})\s+[0-9A-Fa-f]{2}/
const SECTION_HEAD = /^__(?:(.+)_)?head\s*=\s*\$([0-9A-Fa-f]+)/
const LABEL_LINE = /^(\S+)\s*=\s*\$([0-9A-Fa-f]+)\s*;\s*addr\b/
// Tail of a map symbol comment: "..., code_compiler, main.c::main::0::2:5" —
// the source file (before the first `::`) and the C line (after the final `:`).
const SYM_LOC = /,\s*([^\s,]+?)::[^,]*:(\d+)\s*$/

export interface Z88dkCDebug {
  sourceMap: SourceMap
  labels: Map<string, number>
}

/** Build a SourceMap + labels for sccz80-compiled C. `lists` are the per-object
 *  z80asm listings that carry `C_LINE` (one per compiled .c); `map` is the final
 *  link map. `projectFiles` resolves the C_LINE filenames back to project paths
 *  by basename (the compiler may reference them bare). */
export function parseZ88dkCDebug(lists: readonly string[], map: string, projectFiles: readonly string[]): Z88dkCDebug {
  const byBase = new Map<string, string>()
  for (const p of projectFiles) if (!byBase.has(basename(p))) byBase.set(basename(p), p)
  const resolve = (f: string): string => byBase.get(basename(f)) ?? f

  // Section bases + labels from the link map; symbol→(file,line) anchors too.
  const sectionBase = new Map<string, number>()
  const labels = new Map<string, number>()
  const anchors: { file: string; line: number; addr: number }[] = []
  for (const line of map.split(/\r?\n/)) {
    const h = SECTION_HEAD.exec(line)
    if (h) { sectionBase.set(h[1] ?? '', parseInt(h[2], 16)); continue }
    const l = LABEL_LINE.exec(line)
    if (!l) continue
    const addr = parseInt(l[2], 16)
    labels.set(l[1], addr)
    const loc = SYM_LOC.exec(line)
    if (loc) anchors.push({ file: resolve(loc[1]), line: parseInt(loc[2], 10), addr })
  }

  const addrToLoc = new Map<number, SourceLoc>()
  const locToAddr = new Map<string, Map<number, number>>()
  const record = (file: string, line: number, addr: number): void => {
    if (!addrToLoc.has(addr)) addrToLoc.set(addr, { file, line })
    let fileMap = locToAddr.get(file)
    if (!fileMap) { fileMap = new Map(); locToAddr.set(file, fileMap) }
    if (!fileMap.has(line)) fileMap.set(line, addr)
  }

  // Per-line mapping from each listing: C_LINE sets the file, the column-1 line
  // is the C line, offset+section-base is the address.
  for (const lis of lists) {
    let file = ''
    let section = ''
    for (const raw of lis.split(/\r?\n/)) {
      const cl = C_LINE.exec(raw)
      if (cl) { file = resolve(cl[2].split('::')[0]); continue }
      const sec = SECTION_LINE.exec(raw)
      if (sec) { section = sec[1]; continue }
      const code = CODE_LINE.exec(raw)
      if (!code || !file) continue
      const lineno = parseInt(code[1], 10)
      if (lineno < 1) continue // C_LINE 0 = module prologue, no source line
      const base = sectionBase.get(section) ?? sectionBase.get('') ?? 0
      record(file, lineno, (base + parseInt(code[2], 16)) & 0xffff)
    }
  }

  // Map-symbol anchors (function entries) are exact regardless of object layout —
  // add any the listings didn't already cover (e.g. multi-object builds).
  for (const a of anchors) record(a.file, a.line, a.addr)

  return { sourceMap: { addrToLoc, locToAddr }, labels }
}
