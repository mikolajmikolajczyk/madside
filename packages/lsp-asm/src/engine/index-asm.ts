// Build the project-wide AsmIndex from the open files. One linear pass per file:
// split into lines, parse each, and collect definitions + references keyed by
// normalized name (plus a per-file grouping for outline/diagnostics).

import type { SourceFile } from '@madside/lsp-core'
import type { AsmDialect } from '../dialect'
import { emptyIndex, type AsmDef, type AsmIndex, type AsmRef } from './types'
import { normalize, parseLine } from './tokenize'

export function buildIndex(files: SourceFile[], d: AsmDialect): AsmIndex {
  const index = emptyIndex()
  for (const file of files) {
    index.files.set(file.path, file)
    const bucket = { defs: [] as AsmDef[], refs: [] as AsmRef[] }
    index.byUri.set(file.path, bucket)

    const text = file.text
    let lineStart = 0
    let lineNo = 1
    for (;;) {
      const nl = text.indexOf('\n', lineStart)
      const end = nl === -1 ? text.length : nl
      const line = text.slice(lineStart, end)
      const parsed = parseLine(line, lineStart, d)

      if (parsed.def) {
        const def: AsmDef = {
          name: parsed.def.name,
          kind: parsed.def.kind,
          uri: file.path,
          start: parsed.def.start,
          end: parsed.def.end,
          line: lineNo,
          value: parsed.def.value,
        }
        bucket.defs.push(def)
        const key = normalize(def.name, d)
        const list = index.defs.get(key)
        if (list) list.push(def)
        else index.defs.set(key, [def])
      }
      for (const r of parsed.refs) {
        const ref: AsmRef = { name: r.name, uri: file.path, start: r.start, end: r.end, mnemonic: r.mnemonic }
        bucket.refs.push(ref)
        const key = normalize(r.name, d)
        const list = index.refs.get(key)
        if (list) list.push(ref)
        else index.refs.set(key, [ref])
      }

      if (nl === -1) break
      lineStart = nl + 1
      lineNo++
    }
  }
  return index
}
