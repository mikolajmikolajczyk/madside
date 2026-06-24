// Parse z80asm's list (`-l`) + map (`-m`) files into a workbench SourceMap +
// labels, giving ZX (48K + 128K) the same source-level debugging as the cc65 /
// MADS toolchains: gutter addresses, breakpoints on source lines, current-line
// highlight (the #87 debt — z80asm was previously run with `-b` only).
//
// z80asm output shapes:
//   list (`*.lis`):  a per-file dump. A "FILE:" header switches the active file;
//     an emitting line is "<lineno>  <offset>  <bytes...>  <source text>", where
//     <offset> is 4 hex digits RELATIVE to the line's SECTION. Non-emitting
//     lines (labels, comments, directives) carry no offset.
//   map  (`*.map`):  "NAME = $ADDR ; <kind>, ..., <section>, <file:line>" lines.
//     `__head` / `__<section>_head` give each section's load address; entries
//     tagged `addr` are code labels.
//
// Absolute address = section base (from the map) + the list's per-line offset.

import type { SourceLoc, SourceMap } from '@ports'
import { basename } from '@core/path'

const FILE_HEADER = /^(\S.*?):\s*$/
const SECTION_LINE = /^\s*\d+\s+SECTION\s+(\S+)/
// "<lineno>  <offset4hex>  <bytes>": the offset is exactly 4 hex digits, then at
// least one byte pair. Distinguishes emitting lines from equates / labels.
const CODE_LINE = /^\s*(\d+)\s+([0-9A-Fa-f]{4})\s+[0-9A-Fa-f]{2}/
const SECTION_HEAD = /^__(?:(.+)_)?head\s*=\s*\$([0-9A-Fa-f]+)/
const LABEL_LINE = /^(\S+)\s*=\s*\$([0-9A-Fa-f]+)\s*;\s*addr\b/

export interface Z80asmDebug {
  sourceMap: SourceMap
  labels: Map<string, number>
}

/** `projectFiles` are the build's source paths; list/map file references use the
 *  path as z80asm saw it (often a basename), so we resolve back to the project
 *  path by basename — same approach as the MADS parser. */
export function parseZ80asmDebug(lis: string, map: string, projectFiles: readonly string[]): Z80asmDebug {
  const byBase = new Map<string, string>()
  for (const p of projectFiles) if (!byBase.has(basename(p))) byBase.set(basename(p), p)
  const resolve = (f: string): string => byBase.get(basename(f)) ?? f

  // Section base addresses + labels from the map.
  const sectionBase = new Map<string, number>() // '' = the default unnamed section
  const labels = new Map<string, number>()
  for (const line of map.split(/\r?\n/)) {
    const h = SECTION_HEAD.exec(line)
    if (h) { sectionBase.set(h[1] ?? '', parseInt(h[2], 16)); continue }
    const l = LABEL_LINE.exec(line)
    if (l) labels.set(l[1], parseInt(l[2], 16))
  }

  const addrToLoc = new Map<number, SourceLoc>()
  const locToAddr = new Map<string, Map<number, number>>()
  let file = ''
  let section = ''
  for (const raw of lis.split(/\r?\n/)) {
    const fh = FILE_HEADER.exec(raw)
    if (fh && !/\s/.test(fh[1])) { file = resolve(fh[1]); continue }
    const sec = SECTION_LINE.exec(raw)
    if (sec) { section = sec[1]; continue }
    const cl = CODE_LINE.exec(raw)
    if (!cl || !file) continue
    const lineno = parseInt(cl[1], 10)
    const offset = parseInt(cl[2], 16)
    const base = sectionBase.get(section) ?? sectionBase.get('') ?? 0
    const addr = (base + offset) & 0xffff
    if (!addrToLoc.has(addr)) addrToLoc.set(addr, { file, line: lineno })
    let fileMap = locToAddr.get(file)
    if (!fileMap) { fileMap = new Map(); locToAddr.set(file, fileMap) }
    if (!fileMap.has(lineno)) fileMap.set(lineno, addr)
  }

  return { sourceMap: { addrToLoc, locToAddr }, labels }
}
