import type { SyntaxNode } from '@lezer/common'
import type { CIndex, CSemanticToken, CTokenType } from './types'
import { parseC } from './parse'
import { slice, walk } from './ast'

// Semantic tokens: classify each identifier in the tree by its resolved role
// (type / function / macro / parameter / field / variable) for richer
// highlighting than the lexer gives. Uses tree context first (a function
// declarator's name, a parameter, a field) and falls back to the index for
// references (a name known to be a function, macro, or type). Pure — offsets
// out, the LSP delta-encodes them.

/** True if any ancestor of `n` is a `ParameterDeclaration` (so `n` is a param). */
function inParameter(n: SyntaxNode): boolean {
  for (let a = n.parent; a; a = a.parent) {
    if (a.name === 'ParameterDeclaration') return true
    if (a.name === 'FunctionDefinition' || a.name === 'CompoundStatement') return false
  }
  return false
}

function classifyIdentifier(n: SyntaxNode, text: string, index: CIndex): CTokenType {
  // The name in a function declarator (definition or prototype) is a function.
  if (n.parent?.name === 'FunctionDeclarator') return 'function'
  if (inParameter(n)) return 'parameter'

  const name = slice(text, n)
  const sym = index.symbols.get(name)
  if (sym?.kind === 'function') return 'function'
  if (sym?.kind === 'macro') return 'macro'
  if (index.types.has(name)) return 'type'
  if (sym?.kind === 'global') return 'variable'
  return 'variable'
}

export function semanticTokens(
  index: CIndex,
  text: string,
  decorators?: RegExp,
): CSemanticToken[] {
  const root = parseC(text, decorators).topNode
  const out: CSemanticToken[] = []
  walk(root, (n) => {
    let type: CTokenType | null = null
    if (n.name === 'TypeIdentifier') type = 'type'
    else if (n.name === 'FieldIdentifier') type = 'field'
    else if (n.name === 'Identifier') type = classifyIdentifier(n, text, index)
    if (type) out.push({ start: n.from, end: n.to, type })
  })
  // Pre-order is already source-ordered for our leaf identifiers, but sort to be
  // safe — the LSP delta encoding requires ascending positions.
  return out.sort((a, b) => a.start - b.start)
}
