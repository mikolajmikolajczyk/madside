import type { CIndex, CType } from './types'
import { resolveVarType } from './ast'

// Member-access resolution shared by completion and hover. Given a base
// identifier and a chain of `.field` / `->field` / `[…]` accessors, walk the
// type table step by step to the final struct/union/enum type. Pure data —
// works off the live buffer (for locals/params) plus the built index (for
// project + sysroot symbols, incl. cc65 register macros and typedef aliases).

// The struct/union/enum *tag* a written type resolves to: drop qualifiers,
// pointer/array markers, and the `struct`/`union`/`enum` keyword, leaving the
// name the type table is keyed on (`struct Inner *` → `Inner`).
export function typeKey(type: string): string {
  return type
    .replace(/\b(?:const|volatile)\b/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:struct|union|enum)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Look up a type by key, following typedef aliases transitively
 *  (`SP` → `S`). Returns the resolved `CType` or undefined. */
export function lookupType(index: CIndex, key: string): CType | undefined {
  const seen = new Set<string>()
  let k = key
  while (k && !seen.has(k)) {
    seen.add(k)
    const t = index.types.get(k)
    if (t) return t
    const alias = index.aliases.get(k)
    if (!alias) return undefined
    k = typeKey(alias)
  }
  return undefined
}

/** The base identifier's type tag: a buffer declaration wins (locals shadow),
 *  else an indexed typed symbol — e.g. a cc65 register macro `#define VIC
 *  (*(struct __vic2*)…)`. */
function baseType(
  index: CIndex,
  text: string,
  base: string,
  offset: number,
  decorators?: RegExp,
): string | null {
  return resolveVarType(text, base, offset, decorators) ?? index.symbols.get(base)?.type ?? null
}

// Each accessor in a chain: `.field` / `->field` (captures the name) or `[…]`.
const ACCESSOR = /(?:\.|->)\s*([A-Za-z_]\w*)|\[[^\]]*\]/g

/** Resolve `base` + an accessor `chain` string to the final struct/union/enum
 *  type whose fields should be offered, or null. A `[…]` subscript keeps the
 *  current (element) type; a `.f`/`->f` step moves to field `f`'s type. */
export function resolveChainType(
  index: CIndex,
  text: string,
  base: string,
  chain: string,
  offset: number,
  decorators?: RegExp,
): CType | null {
  const bt = baseType(index, text, base, offset, decorators)
  let ct = bt ? lookupType(index, typeKey(bt)) : undefined
  for (const m of chain.matchAll(ACCESSOR)) {
    if (!ct) return null
    const field = m[1]
    if (field === undefined) continue // `[…]` subscript → element type unchanged
    const f = ct.fields.find((x) => x.name === field)
    if (!f) return null
    ct = lookupType(index, typeKey(f.type))
  }
  return ct ?? null
}
