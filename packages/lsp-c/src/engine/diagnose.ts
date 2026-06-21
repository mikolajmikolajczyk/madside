import type { SyntaxNode } from '@lezer/common'
import type { CIndex, CSemanticDiagnostic } from './types'
import { parseC } from './parse'
import { deepChild, slice, walk } from './ast'
import { lookupType, resolveChainType } from './resolve'

// Analysis-driven diagnostics: errors the engine computes itself from the parse
// tree + the index, live as you type, without running cc65 (complementary to the
// build-output diagnostics in diagnostics.ts). Offsets out; the LSP converts.
//
// Guiding rule (#29): a check that cries wolf is worse than none. The cc65
// dialect, the preprocessor, `__fastcall__`, and register macros make naive
// checks false-positive, so every check here only fires when the engine has
// resolved the situation with confidence — an unresolved receiver or an unknown
// macro yields no diagnostic, never a guess.

// A receiver expression we can resolve: a base identifier followed only by
// `.f` / `->f` / `[…]` accessors (what resolveChainType understands). Anything
// else — a call, a cast, parens, pointer arithmetic — we deliberately skip.
const RESOLVABLE_RECEIVER = /^([A-Za-z_]\w*)((?:\s*(?:\.|->)\s*[A-Za-z_]\w*|\s*\[[^\]]*\])*)$/

/** Bad member access: `recv.field` / `recv->field` where the receiver resolves
 *  to a known struct/union but has no such field. */
function checkMemberAccess(
  node: SyntaxNode,
  text: string,
  index: CIndex,
  out: CSemanticDiagnostic[],
  decorators?: RegExp,
): void {
  const field = node.getChild('FieldIdentifier')
  const receiver = node.firstChild
  if (!field || !receiver || receiver.from === field.from) return

  const m = RESOLVABLE_RECEIVER.exec(slice(text, receiver).trim())
  if (!m) return // complex receiver — not confident, skip

  const type = resolveChainType(index, text, m[1] ?? '', m[2] ?? '', field.from, decorators)
  // Only flag when the receiver confidently resolved to a record type.
  if (!type || type.kind === 'enum') return

  const name = slice(text, field)
  if (!type.fields.some((f) => f.name === name)) {
    out.push({
      start: field.from,
      end: field.to,
      severity: 'error',
      message: `no member named '${name}' in '${type.kind} ${type.name}'`,
    })
  }
}

/** True if `spec` is a forward declaration `struct X;` — a tag with no body that
 *  is the whole declaration (no declarator). */
function isForwardDecl(spec: SyntaxNode): boolean {
  const parent = spec.parent
  if (parent?.name !== 'Declaration') return false
  // No declarator siblings (Identifier / *Declarator) means `struct X;`.
  for (let ch = parent.firstChild; ch; ch = ch.nextSibling) {
    if (ch === spec) continue
    if (ch.name.endsWith('Declarator') || ch.name === 'Identifier') return false
  }
  return true
}

/** Unknown struct/union tag: a `struct X` / `union X` *value* reference whose tag
 *  is defined nowhere the engine can see. Pointer uses are skipped (opaque
 *  pointers to incomplete types are valid C), as are forward declarations. */
function checkUnknownTag(
  node: SyntaxNode,
  text: string,
  index: CIndex,
  knownTags: Set<string>,
  out: CSemanticDiagnostic[],
): void {
  if (node.getChild('FieldDeclarationList')) return // a definition, not a reference
  const tag = node.getChild('TypeIdentifier')
  if (!tag) return
  // A pointer to an incomplete type is legal — only a value use needs the tag.
  if (node.parent && deepChild(node.parent, 'PointerDeclarator')) return

  const name = slice(text, tag)
  if (knownTags.has(name) || lookupType(index, name) || index.aliases.has(name)) return

  out.push({
    start: tag.from,
    end: tag.to,
    severity: 'error',
    message: `unknown ${node.name === 'UnionSpecifier' ? 'union' : 'struct'} '${name}'`,
  })
}

export function diagnoseC(
  index: CIndex,
  text: string,
  decorators?: RegExp,
): CSemanticDiagnostic[] {
  const root = parseC(text, decorators).topNode
  const out: CSemanticDiagnostic[] = []

  // Tags declared in this file (definitions + forward declarations) — so a
  // forward-declared or locally-defined tag is never reported unknown.
  const knownTags = new Set<string>()
  walk(root, (n) => {
    if (n.name !== 'StructSpecifier' && n.name !== 'UnionSpecifier') return
    const tag = n.getChild('TypeIdentifier')
    if (tag && (n.getChild('FieldDeclarationList') || isForwardDecl(n))) {
      knownTags.add(slice(text, tag))
    }
  })

  walk(root, (n) => {
    if (n.name === 'FieldExpression') checkMemberAccess(n, text, index, out, decorators)
    else if (n.name === 'StructSpecifier' || n.name === 'UnionSpecifier') {
      checkUnknownTag(n, text, index, knownTags, out)
    }
  })
  return out.sort((a, b) => a.start - b.start)
}
