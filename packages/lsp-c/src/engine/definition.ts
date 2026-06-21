import type { CIndex, CLocation } from './types'
import { wordAt } from './ast'
import { resolveChainType } from './resolve'

// The definition location of the identifier under `offset`. Mirrors hover's
// member/identifier split: a `lhs.word` / `lhs->word` access resolves the
// field's declaration; a bare word resolves a symbol or a type. Returns the
// stored offset range (the LSP converts it to a line/column `Location`), or
// null on a miss.

// A member-access expression ending just before the target word.
const MEMBER_BEFORE =
  /([A-Za-z_]\w*)((?:\s*(?:\.|->)\s*[A-Za-z_]\w*|\s*\[[^\]]*\])*)\s*(?:\.|->)\s*$/

export function definitionAt(
  index: CIndex,
  text: string,
  offset: number,
  decorators?: RegExp,
): CLocation | null {
  const word = wordAt(text, offset)
  if (!word) return null

  // Field access: resolve the LHS expression's type, then the field's decl.
  const member = MEMBER_BEFORE.exec(text.slice(0, word.from))
  if (member) {
    const base = member[1] ?? ''
    const chain = member[2] ?? ''
    const type = resolveChainType(index, text, base, chain, word.from, decorators)
    return type?.fields.find((f) => f.name === word.word)?.loc ?? null
  }

  return index.symbols.get(word.word)?.loc ?? index.types.get(word.word)?.loc ?? null
}
