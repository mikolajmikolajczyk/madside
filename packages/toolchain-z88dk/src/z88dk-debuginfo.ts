import { indexC, typeOfSymbol, resolveType, functionLocals, CC65_SIZES, type ResolvedType } from '@madside/lsp-c'
import type { DebugInfo, DebugSymbol, DebugScope, DebugLocal, DebugType } from '@ports'
import { parseCdbFrameVars } from './z88dk-cdb'

// The z88dk (sccz80) toolchain's DebugInfo provider (ADR-0011/0012, #136). Joins
// assembled addresses with C types from @madside/lsp-c — same port + join the
// cc65 provider uses, so the Variables panel never imports lsp-c. sccz80 is
// little-endian and C-mangles names with a leading `_`; its int/pointer sizes
// match cc65 (16-bit), so CC65_SIZES applies. Unlike cc65, sccz80 (built with
// `-frameix`) has a real IX frame pointer, so locals resolve reliably: each scope
// carries `frame: { kind: 'reg', reg: 'ix' }` and IX-relative offsets from the
// cdb records (z88dk-cdb).

const SIZES = CC65_SIZES // sccz80 == cc65: char 1, int/pointer 2, long 4

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
  content: Uint8Array | string
}

/** Build the typed-symbol model for an sccz80 C build. `cdbAsm` is the
 *  concatenated sccz80 `-debug-defc` output carrying the cdb frame records;
 *  `labels` is the link map's public symbols (C names mangled with `_`). Globals
 *  lsp-c can type become `symbols`; per-function frames become `scopes` with
 *  IX-relative locals. */
export function buildZ88dkDebugInfo(files: readonly SourceFile[], labels: Map<string, number>, cdbAsm: string): DebugInfo {
  const dec = new TextDecoder()
  const sources = files
    .filter((f) => /\.[ch]$/i.test(f.path))
    .map((f) => ({ path: f.path, text: typeof f.content === 'string' ? f.content : dec.decode(f.content) }))
  const index = indexC(sources)

  // Typed globals (same join as cc65).
  const symbols: DebugSymbol[] = []
  for (const [label, addr] of labels) {
    const cName = label.startsWith('_') ? label.slice(1) : label
    const resolved = typeOfSymbol(index, cName, SIZES)
    if (!resolved || resolved.kind === 'unknown') continue
    symbols.push({ name: cName, location: { addr }, type: toDebugType(resolved) })
  }

  // Per-function frame scopes from the cdb records × lsp-c local types.
  const byBasename = new Map<string, string>() // file basename → source text
  for (const s of sources) byBasename.set(s.path.split('/').pop()!, s.text)
  const vars = parseCdbFrameVars(cdbAsm)

  // Group frame vars by function; resolve each var's type from the C source.
  const byFunc = new Map<string, { file: string; locals: DebugLocal[] }>()
  for (const v of vars) {
    const text = byBasename.get(v.file.split('/').pop()!)
    if (!text) continue
    let entry = byFunc.get(v.func)
    if (!entry) { entry = { file: v.file, locals: [] }; byFunc.set(v.func, entry) }
    // Type comes from the source declaration (lsp-c), matched by name.
    const decl = functionLocals(text, v.func).find((l) => l.name === v.name)
    const type: DebugType = decl ? toDebugType(resolveType(index, decl.dtype, SIZES)) : { kind: 'unknown', bytes: 0 }
    entry.locals.push({ name: v.name, offset: v.offset, type })
  }

  // Each scope's PC range: [function entry, next function entry). Sorted by addr.
  const scoped: { name: string; start: number; locals: DebugLocal[] }[] = []
  for (const [func, e] of byFunc) {
    const start = labels.get('_' + func)
    if (start === undefined) continue
    scoped.push({ name: func, start, locals: e.locals })
  }
  scoped.sort((a, b) => a.start - b.start)
  const scopes: DebugScope[] = scoped.map((s, i) => ({
    name: s.name,
    pc: { start: s.start, end: scoped[i + 1]?.start ?? 0x10000 },
    frame: { kind: 'reg', reg: 'ix' },
    locals: s.locals,
  }))

  return scopes.length > 0 ? { symbols, scopes } : { symbols }
}
