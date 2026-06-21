// Parser for the cc65 debug-info file (`ld65 --dbgfile`, dbginfo v2). Turns the
// `.dbg` into the workbench `SourceMap` + label map, so cc65 projects get the
// same source-level debugging as MADS: PC-line highlight, gutter addresses, and
// line breakpoints — including on **C** source lines (#49).
//
// Format (tab-separated keyword, then a `key=val,key=val` field list):
//   seg  id=0,name="CODE",start=0x8069,size=0x17E,...     segment base address
//   span id=0,seg=0,start=0,size=3                        byte range in a segment
//   line id=10,file=2,line=1,type=1,span=12+19           a source line → span(s)
//   sym  id=6,name="_main",val=0x807E,type=lab            a label (address)
//   file id=2,name="src/main.c",...                       a source file
// A source line's address(es) = for each of its spans: seg(span.seg).start + span.start.

import type { SourceMap } from '@ports'
import { basename } from '@core/path'

const num = (s: string | undefined): number =>
  s == null ? NaN : s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10)

/** Parse a `key=val,key=val` list. Values may be `"quoted"` (commas inside the
 *  quotes are preserved) or bare. */
function parseFields(s: string): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i < s.length) {
    const eq = s.indexOf('=', i)
    if (eq < 0) break
    const key = s.slice(i, eq)
    let j = eq + 1
    let val: string
    if (s[j] === '"') {
      const end = s.indexOf('"', j + 1)
      val = s.slice(j + 1, end < 0 ? s.length : end)
      j = end < 0 ? s.length : end + 1
      while (j < s.length && s[j] !== ',') j++ // skip to the next comma
    } else {
      let k = j
      while (k < s.length && s[k] !== ',') k++
      val = s.slice(j, k)
      j = k
    }
    out.set(key, val)
    i = j + 1
  }
  return out
}

export interface ParsedDbg {
  sourceMap: SourceMap
  labels: Map<string, number>
}

/** Parse a cc65 `.dbg` into a SourceMap + labels. `projectFiles` are the build's
 *  source paths; only `.dbg` files whose basename matches one of them are mapped
 *  (the SourceMap is keyed by the project path), which both keeps cc65's ~4600
 *  runtime-library line records out of the map and resolves the WASI path the
 *  tools recorded back to the project's own path. */
export function parseDbg(text: string, projectFiles: readonly string[]): ParsedDbg {
  // Project path keyed by basename, so a `.dbg` file record resolves to it.
  const byBase = new Map<string, string>()
  for (const p of projectFiles) if (!byBase.has(basename(p))) byBase.set(basename(p), p)

  const segStart = new Map<number, number>()        // seg id → base address
  const spans = new Map<number, { seg: number; start: number }>()
  const dbgFileToProject = new Map<number, string>() // file id → project path
  interface LineRec { file: number; line: number; spanIds: number[] }
  const lines: LineRec[] = []
  const labels = new Map<string, number>()

  for (const raw of text.split('\n')) {
    const tab = raw.indexOf('\t')
    if (tab < 0) continue
    const kind = raw.slice(0, tab)
    const f = parseFields(raw.slice(tab + 1))
    switch (kind) {
      case 'seg':
        segStart.set(num(f.get('id')), num(f.get('start')))
        break
      case 'span':
        spans.set(num(f.get('id')), { seg: num(f.get('seg')), start: num(f.get('start')) })
        break
      case 'file': {
        const project = byBase.get(basename(f.get('name') ?? ''))
        if (project) dbgFileToProject.set(num(f.get('id')), project)
        break
      }
      case 'line': {
        const fileId = num(f.get('file'))
        const spanField = f.get('span')
        if (!dbgFileToProject.has(fileId) || !spanField) break
        lines.push({ file: fileId, line: num(f.get('line')), spanIds: spanField.split('+').map(num) })
        break
      }
      case 'sym': {
        if (f.get('type') !== 'lab') break
        const val = f.get('val')
        if (val != null) labels.set(f.get('name') ?? '', num(val))
        break
      }
    }
  }

  const addrToLoc: SourceMap['addrToLoc'] = new Map()
  const locToAddr: SourceMap['locToAddr'] = new Map()
  const lineToAddrs = new Map<string, Map<number, number[]>>()

  for (const rec of lines) {
    const file = dbgFileToProject.get(rec.file)!
    const addrs: number[] = []
    for (const sid of rec.spanIds) {
      const span = spans.get(sid)
      if (!span) continue
      const base = segStart.get(span.seg)
      if (base == null) continue
      addrs.push(base + span.start)
    }
    if (addrs.length === 0) continue
    addrs.sort((a, b) => a - b)

    for (const a of addrs) if (!addrToLoc.has(a)) addrToLoc.set(a, { file, line: rec.line })

    const lineMap = locToAddr.get(file) ?? new Map<number, number>()
    const prev = lineMap.get(rec.line)
    if (prev == null || addrs[0]! < prev) lineMap.set(rec.line, addrs[0]!)
    locToAddr.set(file, lineMap)

    const allMap = lineToAddrs.get(file) ?? new Map<number, number[]>()
    const existing = allMap.get(rec.line) ?? []
    allMap.set(rec.line, [...new Set([...existing, ...addrs])].sort((a, b) => a - b))
    lineToAddrs.set(file, allMap)
  }

  return { sourceMap: { addrToLoc, locToAddr, lineToAddrs }, labels }
}
