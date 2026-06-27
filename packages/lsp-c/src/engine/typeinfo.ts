import type { CIndex, CType, DType } from './types'
import { lookupType, typeKey } from './resolve'

// Type introspection (#129) — resolve a C symbol's structured declared type
// (DType, built per-declarator in the AST) into a laid-out type for the
// debugger's DebugInfo (ADR-0011). Pure, byte-oriented; the toolchain maps
// ResolvedType onto the agnostic DebugInfo model behind the port (the panel
// never imports this). Struct layout is PACKED (no alignment padding) — the
// convention for the 8-bit C compilers we target (cc65, sccz80); a future
// aligned ABI parameterises this. Anything we can't resolve confidently is
// `unknown` (decoded raw) — never silently mis-typed.

/** Primitive byte widths for a dialect/target. cc65/sccz80: char 1, int 2,
 *  pointer 2. A wide-bus target supplies its own. */
export interface CPrimitiveSizes {
  char: number
  short: number
  int: number
  long: number
  pointer: number
}

/** cc65 / sccz80 (16-bit, packed). */
export const CC65_SIZES: CPrimitiveSizes = { char: 1, short: 2, int: 2, long: 4, pointer: 2 }

export interface ResolvedField {
  name: string
  offset: number
  type: ResolvedType
}

export type ResolvedType =
  | { kind: 'scalar'; bytes: number; signed: boolean; repr: 'int' | 'char' | 'bool' }
  | { kind: 'pointer'; bytes: number; to: ResolvedType }
  | { kind: 'array'; bytes: number; count: number; of: ResolvedType }
  | { kind: 'struct' | 'union'; name: string; bytes: number; fields: ResolvedField[] }
  | { kind: 'enum'; name: string; bytes: number }
  | { kind: 'unknown'; text: string }

export function sizeOf(t: ResolvedType): number {
  return t.kind === 'unknown' ? 0 : t.bytes
}

// Strip cv-qualifiers; report sign + the base keyword for a scalar, or null if
// the text isn't a primitive.
function scalarOf(text: string, sizes: CPrimitiveSizes): ResolvedType | null {
  const t = text.replace(/\b(?:const|volatile)\b/g, ' ').replace(/\s+/g, ' ').trim()
  const signed = !/\bunsigned\b/.test(t)
  const base = t.replace(/\b(?:unsigned|signed)\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (base === 'char') return { kind: 'scalar', bytes: sizes.char, signed, repr: 'char' }
  if (base === '_Bool' || base === 'bool') return { kind: 'scalar', bytes: 1, signed: false, repr: 'bool' }
  if (base === 'short' || base === 'short int') return { kind: 'scalar', bytes: sizes.short, signed, repr: 'int' }
  if (base === 'long' || base === 'long int') return { kind: 'scalar', bytes: sizes.long, signed, repr: 'int' }
  if (base === 'int' || base === '' /* bare unsigned/signed */) {
    return { kind: 'scalar', bytes: sizes.int, signed, repr: 'int' }
  }
  return null
}

interface Ctx {
  index: CIndex
  sizes: CPrimitiveSizes
  /** Struct names currently being laid out — guards recursive (pointer) cycles. */
  inProgress: Set<string>
}

function resolveCType(ct: CType, ctx: Ctx): ResolvedType {
  if (ct.kind === 'enum') return { kind: 'enum', name: ct.name, bytes: ctx.sizes.int }
  const kind = ct.kind === 'union' ? 'union' : 'struct'
  // Cycle (only reachable through a pointer field): return the tag shallow so the
  // type tree stays finite; the decoder expands on deref.
  if (ctx.inProgress.has(ct.name)) return { kind, name: ct.name, bytes: 0, fields: [] }
  ctx.inProgress.add(ct.name)
  const fields: ResolvedField[] = []
  let offset = 0
  let max = 0
  for (const f of ct.fields) {
    const ft = f.dtype ? resolveD(f.dtype, ctx) : { kind: 'unknown' as const, text: f.type }
    fields.push({ name: f.name, offset: kind === 'union' ? 0 : offset, type: ft })
    const sz = sizeOf(ft)
    if (kind === 'union') max = Math.max(max, sz)
    else offset += sz
  }
  ctx.inProgress.delete(ct.name)
  return { kind, name: ct.name, bytes: kind === 'union' ? max : offset, fields }
}

function resolveBase(text: string, ctx: Ctx): ResolvedType {
  const t = text.trim()
  if (!t || t === '?') return { kind: 'unknown', text }
  const scalar = scalarOf(t, ctx.sizes)
  if (scalar) return scalar
  const ct = lookupType(ctx.index, typeKey(t))
  if (ct) return resolveCType(ct, ctx)
  const alias = ctx.index.aliases.get(typeKey(t))
  if (alias) return resolveBase(alias, ctx)
  return { kind: 'unknown', text: t }
}

function resolveD(d: DType, ctx: Ctx): ResolvedType {
  switch (d.k) {
    case 'base':
      return resolveBase(d.text, ctx)
    case 'ptr':
      return { kind: 'pointer', bytes: ctx.sizes.pointer, to: resolveD(d.to, ctx) }
    case 'array': {
      const of = resolveD(d.of, ctx)
      const count = resolveCount(d.count, ctx)
      return { kind: 'array', count, of, bytes: count * sizeOf(of) }
    }
  }
}

/** Resolve an array's element count: a literal as-is, or a macro/constant size
 *  (`#define N 3` → `[N]`) looked up in the index. Follows one macro→macro hop;
 *  anything non-numeric (an expression) falls back to 0 (raw display). */
function resolveCount(c: number | string, ctx: Ctx): number {
  if (typeof c === 'number') return c
  let tok = c
  for (let hop = 0; hop < 4; hop++) {
    const n = Number(tok)
    if (Number.isFinite(n) && n >= 0) return n
    const v = ctx.index.symbols.get(tok)?.value
    if (v == null) return 0
    tok = v.trim()
  }
  return 0
}

/** Resolve a structured declared type (DType) into a laid-out type. */
export function resolveType(index: CIndex, dtype: DType, sizes: CPrimitiveSizes): ResolvedType {
  return resolveD(dtype, { index, sizes, inProgress: new Set() })
}

/** The resolved type of a global symbol, or undefined if it has no captured
 *  structured type (the debugger then shows it raw). */
export function typeOfSymbol(
  index: CIndex,
  name: string,
  sizes: CPrimitiveSizes,
): ResolvedType | undefined {
  const dtype = index.symbols.get(name)?.dtype
  return dtype ? resolveType(index, dtype, sizes) : undefined
}
