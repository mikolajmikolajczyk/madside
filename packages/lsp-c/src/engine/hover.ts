import type { CIndex, CSymbol, CType, HoverInfo } from './types'
import { wordAt } from './ast'
import { resolveChainType } from './resolve'

// Hover info for the symbol/field/type under `offset`. Mirrors completion's
// member/identifier split: a `lhs.word` / `lhs->word` access resolves the field
// (over a full chain — `a.b.c`, `arr[0].x`); a bare word resolves a symbol
// (function/macro/global) or a type. Returns markdown contents, or null when
// nothing resolves (a miss, never a throw).

// A member-access expression ending just before the hovered word: a base
// identifier, an accessor chain, and the trailing `.`/`->` operator.
const MEMBER_BEFORE =
  /([A-Za-z_]\w*)((?:\s*(?:\.|->)\s*[A-Za-z_]\w*|\s*\[[^\]]*\])*)\s*(?:\.|->)\s*$/

const codeBlock = (code: string): string => '```c\n' + code + '\n```'

function fieldHover(name: string, type: string): string {
  return [codeBlock(`${type} ${name}`), '', '*field*'].join('\n')
}

function symbolHover(s: CSymbol): string {
  const where = s.header ? `\`<${s.header}>\`` : `\`${s.file}\``
  return [codeBlock(s.detail ?? s.label), '', `*${s.kind}* · ${where}`].join('\n')
}

function typeHover(t: CType): string {
  return [codeBlock(`${t.kind} ${t.name}`), '', `*type* · \`${t.file}\``].join('\n')
}

export function hoverAt(
  index: CIndex,
  text: string,
  offset: number,
  decorators?: RegExp,
): HoverInfo | null {
  const word = wordAt(text, offset)
  if (!word) return null

  // Field access: resolve the LHS expression's type, then the field by name.
  const member = MEMBER_BEFORE.exec(text.slice(0, word.from))
  if (member) {
    const base = member[1] ?? ''
    const chain = member[2] ?? ''
    const type = resolveChainType(index, text, base, chain, word.from, decorators)
    const field = type?.fields.find((f) => f.name === word.word)
    return field ? { contents: fieldHover(field.name, field.type) } : null
  }

  const sym = index.symbols.get(word.word)
  if (sym) return { contents: symbolHover(sym) }

  const type = index.types.get(word.word)
  if (type) return { contents: typeHover(type) }

  return null
}
