import type { CIndex, CSignatureHelp } from './types'

// Signature help for the function call enclosing `offset`. Scans backward to the
// open paren of the current call, reads the callee name before it, and counts
// top-level commas to pick the active parameter. Name-based (no overload
// resolution — cc65 C has none) and brace/bracket-aware so nested calls and
// subscripts don't confuse the active-arg count. A miss returns null, never throws.

const WORD = /\w/
const SPACE = /\s/

/** Offset of the `(` that opens the call enclosing `offset`, or -1 if the cursor
 *  isn't inside a call's argument list. */
function enclosingCallParen(text: string, offset: number): number {
  let depth = 0
  for (let i = offset - 1; i >= 0; i--) {
    const c = text[i]
    if (c === ')' || c === ']' || c === '}') depth++
    else if (c === '(') {
      if (depth === 0) return i
      depth--
    } else if (c === '[' || c === '{') {
      if (depth === 0) return -1 // a subscript/block at our level — not a call arg list
      depth--
    } else if (c === ';') {
      return -1 // statement boundary — bail
    }
  }
  return -1
}

/** The identifier immediately before the open paren at `op`, or ''. */
function calleeName(text: string, op: number): string {
  let j = op - 1
  while (j >= 0 && SPACE.test(text[j] ?? '')) j--
  const end = j + 1
  while (j >= 0 && WORD.test(text[j] ?? '')) j--
  const name = text.slice(j + 1, end)
  return /^[A-Za-z_]/.test(name) ? name : ''
}

/** Top-level comma count between the open paren and the cursor → active param. */
function activeParam(text: string, op: number, offset: number): number {
  let depth = 0
  let active = 0
  for (let i = op + 1; i < offset; i++) {
    const c = text[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) active++
  }
  return active
}

export function signatureHelpAt(
  index: CIndex,
  text: string,
  offset: number,
): CSignatureHelp | null {
  const op = enclosingCallParen(text, offset)
  if (op < 0) return null
  const name = calleeName(text, op)
  if (!name) return null
  const sym = index.symbols.get(name)
  if (sym?.kind !== 'function') return null

  const parameters = sym.params ?? []
  let active = activeParam(text, op, offset)
  if (parameters.length > 0) active = Math.min(active, parameters.length - 1)
  return { label: sym.detail ?? `${name}()`, parameters, activeParameter: active }
}
