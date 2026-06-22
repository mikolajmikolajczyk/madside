import { indexC, typeOfSymbol, CC65_SIZES, type ResolvedType } from '@madside/lsp-c'
import type { DebugInfo, DebugSymbol, DebugType } from '@ports'

// The cc65 toolchain's DebugInfo provider (ADR-0011, #130). Joins the assembled
// symbol addresses (from `.dbg`, `labels`) with C types resolved from the source
// by @madside/lsp-c — the type↔address join lives here, behind the @ports
// DebugInfo port, so the Variables panel never imports lsp-c. cc65 is
// little-endian; names are C-mangled with a leading `_` in the symbol table.

// lsp-c ResolvedType → the agnostic @ports DebugType (adds endianness; cc65 = le).
function toDebugType(r: ResolvedType): DebugType {
  switch (r.kind) {
    case 'scalar':
      return { kind: 'scalar', bytes: r.bytes, signed: r.signed, endian: 'le', repr: r.repr }
    case 'pointer':
      return { kind: 'pointer', bytes: r.bytes, endian: 'le', to: toDebugType(r.to) }
    case 'array':
      return { kind: 'array', bytes: r.bytes, count: r.count, elem: toDebugType(r.of) }
    case 'struct':
    case 'union':
      return {
        kind: r.kind,
        name: r.name,
        bytes: r.bytes,
        fields: r.fields.map((f) => ({ name: f.name, offset: f.offset, type: toDebugType(f.type) })),
      }
    case 'enum':
      return { kind: 'enum', name: r.name, bytes: r.bytes, signed: true, endian: 'le' }
    default:
      return { kind: 'unknown', bytes: 0 }
  }
}

interface SourceFile {
  path: string
  content: Uint8Array
}

/** Build the typed-symbol model for a cc65 C build. `files` are the build
 *  inputs; `labels` is the parsed `.dbg` symbol table (cc65-mangled names →
 *  address). Only globals lsp-c can type are emitted — the rest stay raw in
 *  `labels`. */
export function buildCc65DebugInfo(files: readonly SourceFile[], labels: Map<string, number>): DebugInfo {
  const dec = new TextDecoder()
  const sources = files
    .filter((f) => /\.[ch]$/i.test(f.path))
    .map((f) => ({ path: f.path, text: dec.decode(f.content) }))
  const index = indexC(sources)
  const symbols: DebugSymbol[] = []
  for (const [label, addr] of labels) {
    // cc65 mangles C identifiers with a leading underscore (`score` → `_score`).
    const cName = label.startsWith('_') ? label.slice(1) : label
    const resolved = typeOfSymbol(index, cName, CC65_SIZES)
    if (!resolved || resolved.kind === 'unknown') continue
    symbols.push({ name: cName, location: { addr }, type: toDebugType(resolved) })
  }
  return { symbols }
}
