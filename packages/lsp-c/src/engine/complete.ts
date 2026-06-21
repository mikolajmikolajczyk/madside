import type { CIndex, CType, CompletionItem } from './types'
import { resolveChainType } from './resolve'

// Answer a completion request at `offset` in `text`, given a built `index`.
//   - after `.` / `->`  → resolve the left-hand expression's type, list its fields
//   - otherwise          → matching identifiers (functions / macros / globals / types)
//
// Member resolution reads the *live* buffer (not the index) so locals, params,
// and unsaved edits resolve: we resolve the access chain before the cursor
// (`a.b.c`, `arr[0]`, `p->q`) to a struct/union type and list its fields.

// A member-access expression ending at the cursor: base identifier, then a chain
// of `.field` / `->field` / `[…]` segments, then the trailing operator and the
// partial member being typed.
const MEMBER_RE =
  /([A-Za-z_]\w*)((?:\s*(?:\.|->)\s*[A-Za-z_]\w*|\s*\[[^\]]*\])*)\s*(?:\.|->)\s*(\w*)$/
// A bare identifier prefix under the cursor.
const IDENT_RE = /([A-Za-z_]\w*)$/

const startsWith = (label: string, prefix: string): boolean =>
  label.toLowerCase().startsWith(prefix.toLowerCase())

function memberCompletions(type: CType, prefix: string): CompletionItem[] {
  return type.fields
    .filter((f) => startsWith(f.name, prefix))
    .map((f) => ({ label: f.name, kind: 'field', detail: f.type }))
}

function identifierCompletions(index: CIndex, prefix: string): CompletionItem[] {
  const out: CompletionItem[] = []
  for (const s of index.symbols.values()) {
    if (startsWith(s.label, prefix)) {
      out.push({
        label: s.label,
        kind: s.kind,
        ...(s.detail ? { detail: s.detail } : {}),
        ...(s.header ? { header: s.header } : {}),
      })
    }
  }
  for (const t of index.types.values()) {
    if (startsWith(t.name, prefix)) out.push({ label: t.name, kind: 'type' })
  }
  return out
}

export function completeAt(
  index: CIndex,
  text: string,
  offset: number,
  decorators?: RegExp,
): CompletionItem[] {
  const before = text.slice(0, offset)

  const member = MEMBER_RE.exec(before)
  if (member) {
    const base = member[1] ?? ''
    const chain = member[2] ?? ''
    const partial = member[3] ?? ''
    const type = resolveChainType(index, text, base, chain, offset, decorators)
    return type ? memberCompletions(type, partial) : []
  }

  const ident = IDENT_RE.exec(before)
  return identifierCompletions(index, ident ? (ident[1] ?? '') : '')
}
