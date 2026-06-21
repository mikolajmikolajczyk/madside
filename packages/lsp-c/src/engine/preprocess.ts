// Minimal C preprocessor for the indexer (#30). cc65 selects the per-target
// header set with `#if defined(__C64__)` chains inside <target.h> / <cbm.h>;
// without modelling that, the indexer pulls in *every* target's headers at once
// (cross-target completion noise + false macro-redefinition diagnostics). Given
// the target's predefined macros, this evaluates the conditional directives so
// inactive branches are blanked (offset-preserving, like stripDecorators) and
// each `#include` is tagged active / inactive. Deliberately NOT a full
// preprocessor — no macro expansion or arithmetic beyond what header gating
// needs (defined(), !, &&, ||, parens, integer literals).

import type { Defines } from './types'

export interface PreprocessResult {
  /** Source with inactive `#if`/`#elif`/`#else` regions blanked to whitespace
   *  (lengths + newlines preserved, so symbol offsets stay valid). */
  stripped: string
  /** Every `#include` directive with whether it sits in an active region. */
  includes: { name: string; active: boolean }[]
}

const definedTruthy = (defines: Defines, name: string): boolean => {
  const v = defines[name]
  return v !== undefined && v !== '0' && v !== ''
}

const IDENT = /^[A-Za-z_]\w*/

/** Evaluate a `#if` / `#elif` constant expression under `defines`. */
function evalExpr(expr: string, defines: Defines): boolean {
  let i = 0
  const skip = (): void => {
    while (i < expr.length && /\s/.test(expr[i] ?? '')) i++
  }

  function primary(): boolean {
    skip()
    if (expr[i] === '(') {
      i++
      const v = or()
      skip()
      if (expr[i] === ')') i++
      return v
    }
    if (expr[i] === '!') {
      i++
      return !primary()
    }
    const m = IDENT.exec(expr.slice(i)) ?? /^\d+/.exec(expr.slice(i))
    if (!m) {
      i++
      return false
    }
    const tok = m[0]
    i += tok.length
    if (/^\d+$/.test(tok)) return tok !== '0'
    if (tok === 'defined') {
      skip()
      const paren = expr[i] === '('
      if (paren) i++
      skip()
      const nm = IDENT.exec(expr.slice(i))
      const name = nm?.[0] ?? ''
      i += name.length
      skip()
      if (paren && expr[i] === ')') i++
      return defines[name] !== undefined
    }
    return definedTruthy(defines, tok)
  }

  function and(): boolean {
    let v = primary()
    for (;;) {
      skip()
      if (expr[i] === '&' && expr[i + 1] === '&') {
        i += 2
        v = primary() && v
      } else break
    }
    return v
  }

  function or(): boolean {
    let v = and()
    for (;;) {
      skip()
      if (expr[i] === '|' && expr[i + 1] === '|') {
        i += 2
        v = and() || v
      } else break
    }
    return v
  }

  return or()
}

const DIRECTIVE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b[ \t]*(.*)$/
const INCLUDE = /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"]+)[>"]/

interface Frame {
  parentActive: boolean
  /** Some branch of this if/elif/else group has already been taken. */
  taken: boolean
  /** This branch is the active one (and the parent was active). */
  active: boolean
}

export function preprocess(text: string, defines: Defines): PreprocessResult {
  const lines = text.split('\n')
  const includes: { name: string; active: boolean }[] = []
  const stack: Frame[] = []
  const curActive = (): boolean => {
    const top = stack[stack.length - 1]
    return top === undefined ? true : top.active
  }
  const blank = (line: string): string => ' '.repeat(line.length)
  const out: string[] = []

  for (const line of lines) {
    const d = DIRECTIVE.exec(line)
    if (d) {
      const kind = d[1] ?? ''
      const arg = (d[2] ?? '').trim()
      if (kind === 'if' || kind === 'ifdef' || kind === 'ifndef') {
        const parentActive = curActive()
        const word = arg.split(/\s/)[0] ?? ''
        let cond: boolean
        if (kind === 'ifdef') cond = defines[word] !== undefined
        else if (kind === 'ifndef') cond = defines[word] === undefined
        else cond = evalExpr(arg, defines)
        stack.push({ parentActive, taken: cond, active: parentActive && cond })
      } else if (kind === 'elif') {
        const f = stack[stack.length - 1]
        if (f) {
          const cond = evalExpr(arg, defines)
          f.active = f.parentActive && !f.taken && cond
          f.taken = f.taken || cond
        }
      } else if (kind === 'else') {
        const f = stack[stack.length - 1]
        if (f) {
          f.active = f.parentActive && !f.taken
          f.taken = true
        }
      } else if (kind === 'endif') {
        stack.pop()
      }
      // The directive line itself carries no C declaration — blank it.
      out.push(blank(line))
      continue
    }
    const active = curActive()
    const inc = INCLUDE.exec(line)
    if (inc) includes.push({ name: inc[1] ?? '', active })
    out.push(active ? line : blank(line))
  }

  return { stripped: out.join('\n'), includes }
}
