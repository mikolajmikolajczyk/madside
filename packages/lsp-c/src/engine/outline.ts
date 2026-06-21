import type { SyntaxNode } from '@lezer/common'
import type { CDocumentSymbol, CDocSymbolKind } from './types'
import { parseC } from './parse'
import { declaredIds, deepChild, slice } from './ast'

// File outline: the top-level declarations of a single file (functions, structs,
// unions, enums, typedefs, globals) with their ranges. Pure parse — no index
// needed; the LSP converts offsets to a line/column DocumentSymbol tree.

function makeSymbol(
  name: string,
  kind: CDocSymbolKind,
  node: SyntaxNode,
  id: SyntaxNode,
): CDocumentSymbol {
  return {
    name,
    kind,
    start: node.from,
    end: node.to,
    selectionStart: id.from,
    selectionEnd: id.to,
  }
}

/** A named struct/union/enum *definition* (has a body + tag) → its outline
 *  symbol, or null for an anonymous or forward one. */
function typeSymbol(spec: SyntaxNode, text: string, kind: CDocSymbolKind): CDocumentSymbol | null {
  const tag = spec.getChild('TypeIdentifier')
  const body = spec.getChild('FieldDeclarationList') ?? spec.getChild('EnumeratorList')
  return tag && body ? makeSymbol(slice(text, tag), kind, spec, tag) : null
}

/** The alias identifier a `typedef` introduces: the pointer alias
 *  (`typedef struct S *SP`), else the trailing type name
 *  (`typedef struct {…} Bar`, `typedef Foo Bar`). */
function typedefName(n: SyntaxNode): SyntaxNode | null {
  const ptr = n.getChild('PointerDeclarator')
  if (ptr) return deepChild(ptr, 'TypeIdentifier') ?? deepChild(ptr, 'Identifier')
  const ids = n.getChildren('TypeIdentifier')
  return ids[ids.length - 1] ?? null
}

export function documentSymbols(text: string, decorators?: RegExp): CDocumentSymbol[] {
  const root = parseC(text, decorators).topNode
  const out: CDocumentSymbol[] = []

  for (let n = root.firstChild; n; n = n.nextSibling) {
    // Standalone type definitions are top-level specifier nodes.
    if (n.name === 'StructSpecifier') pushIf(out, typeSymbol(n, text, 'struct'))
    else if (n.name === 'UnionSpecifier') pushIf(out, typeSymbol(n, text, 'union'))
    else if (n.name === 'EnumSpecifier') pushIf(out, typeSymbol(n, text, 'enum'))
    else if (n.name === 'FunctionDefinition') {
      const id = n.getChild('FunctionDeclarator')?.getChild('Identifier')
      if (id) out.push(makeSymbol(slice(text, id), 'function', n, id))
    } else if (n.name === 'TypeDefinition') {
      const id = typedefName(n)
      if (id) out.push(makeSymbol(slice(text, id), 'typedef', n, id))
    } else if (n.name === 'Declaration') {
      const fn = n.getChild('FunctionDeclarator')
      if (fn) {
        const id = fn.getChild('Identifier')
        if (id) out.push(makeSymbol(slice(text, id), 'function', n, id))
        continue
      }
      // An inline type definition in a declaration (`struct Foo {…} g;`): emit
      // the type, then any declared globals.
      const spec = n.getChild('StructSpecifier') ?? n.getChild('UnionSpecifier')
      if (spec)
        pushIf(out, typeSymbol(spec, text, spec.name === 'UnionSpecifier' ? 'union' : 'struct'))
      const enumSpec = n.getChild('EnumSpecifier')
      if (enumSpec) pushIf(out, typeSymbol(enumSpec, text, 'enum'))
      for (const id of declaredIds(n, text)) {
        out.push({
          name: id.name,
          kind: 'variable',
          start: n.from,
          end: n.to,
          selectionStart: id.from,
          selectionEnd: id.to,
        })
      }
    }
  }
  return out
}

function pushIf(out: CDocumentSymbol[], s: CDocumentSymbol | null): void {
  if (s) out.push(s)
}
