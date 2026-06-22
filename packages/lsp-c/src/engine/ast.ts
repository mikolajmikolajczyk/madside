import type { SyntaxNode } from '@lezer/common'
import type { DType } from './types'
import { parseC } from './parse'

// Shared Lezer-tree helpers used by the indexer, the completer, and hover.

export const slice = (text: string, n: SyntaxNode): string => text.slice(n.from, n.to)

const WORD_CHAR = /\w/

/** The identifier word spanning `offset` (expanding both ways over `\w`), or
 *  null if the offset isn't inside an identifier. Words starting with a digit
 *  (numeric literals) are rejected. */
export function wordAt(
  text: string,
  offset: number,
): { word: string; from: number; to: number } | null {
  let from = offset
  while (from > 0 && WORD_CHAR.test(text[from - 1] ?? '')) from--
  let to = offset
  while (to < text.length && WORD_CHAR.test(text[to] ?? '')) to++
  if (from === to) return null
  const word = text.slice(from, to)
  if (!/^[A-Za-z_]/.test(word)) return null
  return { word, from, to }
}

/** The type name of the nearest declaration of `name` before `offset`, or null.
 *  Scans every declaration/parameter in the buffer (so locals + params resolve);
 *  the nearest preceding one wins. Shared by completion + hover. */
export function resolveVarType(
  text: string,
  name: string,
  offset: number,
  decorators?: RegExp,
): string | null {
  const root = parseC(text, decorators).topNode
  const candidates: { pos: number; type: string }[] = []
  walk(root, (n) => {
    if (n.name !== 'Declaration' && n.name !== 'ParameterDeclaration') return
    if (n.from >= offset) return
    if (!declaredNames(n, text).includes(name)) return
    const type = declTypeName(n, text)
    if (type) candidates.push({ pos: n.from, type })
  })
  candidates.sort((a, b) => b.pos - a.pos) // nearest declaration before the cursor wins
  return candidates[0]?.type ?? null
}

/** Depth-first search for the first descendant of the given node type. */
export function deepChild(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
    if (ch.name === name) return ch
    const found = deepChild(ch, name)
    if (found) return found
  }
  return null
}

/** Visit every descendant of `node` (pre-order). */
export function walk(node: SyntaxNode, fn: (n: SyntaxNode) => void): void {
  for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
    fn(ch)
    walk(ch, fn)
  }
}

/** The resolvable type name of a declaration's type specifier — the struct/union
 *  tag or typedef name (what the type table is keyed on), or '' for a primitive. */
export function declTypeName(decl: SyntaxNode, text: string): string {
  const spec = decl.getChild('StructSpecifier') ?? decl.getChild('UnionSpecifier')
  if (spec) {
    const tag = spec.getChild('TypeIdentifier')
    return tag ? slice(text, tag) : ''
  }
  const id = decl.getChild('TypeIdentifier')
  return id ? slice(text, id) : ''
}

/** The written type-spec text of a declaration — primitive / sized / struct /
 *  union / enum / typedef — WITHOUT any declarator (pointer/array). The base for
 *  `buildDType`. `struct Foo`/`enum E` keep the keyword (typeKey strips it). */
export function baseSpecText(decl: SyntaxNode, text: string): string {
  const spec =
    decl.getChild('StructSpecifier') ??
    decl.getChild('UnionSpecifier') ??
    decl.getChild('EnumSpecifier')
  const node =
    spec ??
    decl.getChild('PrimitiveType') ??
    decl.getChild('SizedTypeSpecifier') ??
    decl.getChild('TypeIdentifier')
  if (!node) return ''
  if (spec) {
    const tag = spec.getChild('TypeIdentifier')
    const kw = node.name === 'UnionSpecifier' ? 'union' : node.name === 'EnumSpecifier' ? 'enum' : 'struct'
    return tag ? `${kw} ${slice(text, tag)}` : ''
  }
  return slice(text, node).replace(/\s+/g, ' ').trim()
}

// Numeric size of an ArrayDeclarator (`[10]`), or 0 when absent/non-literal
// (`[]`, VLA) — a 0-count array decodes to nothing, never mis-sized.
function arrayCount(node: SyntaxNode, text: string): number {
  const num = node.getChild('Number')
  if (!num) return 0
  const n = Number(slice(text, num))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// The declarator child that wraps the identifier (skips the type spec children).
function innerDeclarator(node: SyntaxNode): SyntaxNode | null {
  for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
    if (
      ch.name === 'Identifier' ||
      ch.name === 'PointerDeclarator' ||
      ch.name === 'ArrayDeclarator' ||
      ch.name === 'FieldIdentifier'
    ) {
      return ch
    }
  }
  return null
}

/** Build a structured DType from a declarator node, reading C declarators
 *  outside-in (`int *a[10]` = ArrayDeclarator(PointerDeclarator(id)) = array of
 *  pointers). Anything not plainly base/pointer/array (parenthesized, function
 *  declarators) yields a `base:'?'` so the resolver returns `unknown` — raw,
 *  never silently wrong. */
export function buildDType(node: SyntaxNode | null, base: DType, text: string): DType {
  if (!node) return base
  switch (node.name) {
    case 'Identifier':
    case 'FieldIdentifier':
      return base
    case 'InitDeclarator':
      return buildDType(innerDeclarator(node), base, text)
    case 'PointerDeclarator':
      return { k: 'ptr', to: buildDType(innerDeclarator(node), base, text) }
    case 'ArrayDeclarator': {
      // Lezer nests `a[2][3]` as Array(3, Array(2, id)) — the inner C dimension
      // outermost. Gather the dim chain, then fold so the leftmost `[2]` ends up
      // the OUTER array (`array 2 of array 3`).
      const dims: number[] = []
      let cur: SyntaxNode | null = node
      while (cur && cur.name === 'ArrayDeclarator') {
        dims.push(arrayCount(cur, text))
        cur = innerDeclarator(cur)
      }
      let t = buildDType(cur, base, text)
      for (const count of dims) t = { k: 'array', count, of: t }
      return t
    }
    default:
      return { k: 'base', text: '?' }
  }
}

/** Every declared identifier of a `Declaration`/`FieldDeclaration` with its
 *  structured type (#129) — exact pointer/array per declarator, no bleed. */
export function declaredVars(
  decl: SyntaxNode,
  text: string,
): { name: string; from: number; to: number; dtype: DType }[] {
  const base: DType = { k: 'base', text: baseSpecText(decl, text) }
  const out: { name: string; from: number; to: number; dtype: DType }[] = []
  for (let ch = decl.firstChild; ch; ch = ch.nextSibling) {
    const isDeclr =
      ch.name === 'Identifier' ||
      ch.name === 'FieldIdentifier' ||
      ch.name === 'PointerDeclarator' ||
      ch.name === 'ArrayDeclarator' ||
      ch.name === 'InitDeclarator'
    if (!isDeclr) continue
    const id = ch.name === 'Identifier' || ch.name === 'FieldIdentifier'
      ? ch
      : deepChild(ch, 'Identifier') ?? deepChild(ch, 'FieldIdentifier')
    if (!id) continue
    out.push({ name: slice(text, id), from: id.from, to: id.to, dtype: buildDType(ch, base, text) })
  }
  return out
}

// A declarator wrapping the declared identifier: pointer / array / init.
const DECLARATOR = new Set(['PointerDeclarator', 'ArrayDeclarator', 'InitDeclarator'])

/** Every identifier declared by a `Declaration`, in source order — covers
 *  multiple declarators (`int a, b, c;`) and pointer/array/init forms
 *  (`Foo *p, arr[4]`), with each name's offset range. Function declarators are
 *  excluded (handled separately). */
export function declaredIds(
  decl: SyntaxNode,
  text: string,
): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = []
  for (let ch = decl.firstChild; ch; ch = ch.nextSibling) {
    const id =
      ch.name === 'Identifier' ? ch : DECLARATOR.has(ch.name) ? deepChild(ch, 'Identifier') : null
    if (id) out.push({ name: slice(text, id), from: id.from, to: id.to })
  }
  return out
}

/** The declared names of a `Declaration`, in source order. */
export function declaredNames(decl: SyntaxNode, text: string): string[] {
  return declaredIds(decl, text).map((d) => d.name)
}

/** The declared name of a non-function declarator (`Identifier`, possibly under a
 *  pointer/array/init declarator). Returns null for function declarators /
 *  anonymous decls. */
export function declaredName(decl: SyntaxNode, text: string): string | null {
  return declaredNames(decl, text)[0] ?? null
}
