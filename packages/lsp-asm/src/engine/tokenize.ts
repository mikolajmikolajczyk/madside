// Line-oriented assembly tokenizer. Assembly is one statement per line —
// `[label[:]] [mnemonic] [operand] [; comment]` — so a regex/scan pass per line
// is enough (no Lezer grammar). Produces, per line: an optional definition
// (label / equate / macro), the symbol references on the line, and a flat token
// list for semantic highlighting. All offsets are absolute file offsets.

import type { AsmDialect } from '../dialect'

export type SemKind =
  | 'label'
  | 'opcode'
  | 'directive'
  | 'register'
  | 'symbol'
  | 'macro'
  | 'number'
  | 'string'
  | 'comment'

export interface SemTok {
  kind: SemKind
  start: number
  end: number
}

export interface LineDef {
  kind: 'label' | 'equate' | 'macro'
  name: string
  start: number
  end: number
  value?: string
}

export interface LineRef {
  name: string
  start: number
  end: number
  /** True when the reference is in the mnemonic slot (a macro/pseudo-op call) —
   *  not undefined-flagged, since an unrecognized one is more likely a pseudo-op
   *  we don't model than a typo'd symbol. */
  mnemonic?: boolean
}

/** An instruction statement on the line (mnemonic that is a known opcode + its
 *  operand text), for addressing-mode validation. `start`/`end` span the
 *  mnemonic. Absent for directive / macro-call / label-only lines. */
export interface LineInstr {
  mnemonic: string
  operand: string
  start: number
  end: number
}

export interface ParsedLine {
  def?: LineDef
  refs: LineRef[]
  tokens: SemTok[]
  instr?: LineInstr
}

// An optional leading '.' lets m68k local labels (`.regloop`) be one token; the
// trailing class keeps a mnemonic's size suffix (`move.w`) together too.
const IDENT = /\.?[A-Za-z_@?][A-Za-z0-9_@?.]*/g
const NUMBER = /(?:\$[0-9A-Fa-f]+|%[01]+|\d[0-9A-Fa-f]*[hH]?|0[xX][0-9A-Fa-f]+)/g

/** Normalize a symbol name to its index key (case-folded for case-insensitive
 *  assemblers like MADS). */
export function normalize(name: string, dialect: AsmDialect): string {
  return dialect.caseInsensitive ? name.toUpperCase() : name
}

// Strip an operand-size suffix (`.b`/`.w`/`.l`/`.s`) the mnemonic/directive may
// carry (m68k: `move.w` → `move`, `dc.l` → `dc`). No-op unless the dialect uses
// size suffixes. A leading-dot local label (`.loop`) has no trailing size suffix,
// so it's untouched.
const stripSize = (t: string, d: AsmDialect): string => (d.sizeSuffix ? t.replace(/\.[bwls]$/i, '') : t)

/** The uppercase base mnemonic if `t` is an opcode (size suffix stripped) — from
 *  the CPU base set OR the dialect's extra mnemonics (illegal opcodes / pseudo-
 *  ops) — else null. Shared so hover/validation resolve `move.w` → MOVE and MADS
 *  `mva` like the tokenizer. */
export function mnemonicBase(t: string, d: AsmDialect): string | null {
  const base = stripSize(t, d).toUpperCase()
  if (d.cpu.mnemonics.has(base) || d.extras?.mnemonics.has(base)) return base
  return null
}

export const isOpcodeTok = (t: string, d: AsmDialect): boolean => mnemonicBase(t, d) !== null
const isOpcode = isOpcodeTok
const isRegister = (t: string, d: AsmDialect) => d.registers.has(t.toUpperCase())
const isDirective = (t: string, d: AsmDialect): boolean => {
  const bare = d.directivePrefix && t.startsWith(d.directivePrefix) ? t.slice(d.directivePrefix.length) : t
  return d.directives.has(stripSize(bare, d).toLowerCase())
}

/** Find where the line-comment starts, respecting single/double-quoted strings.
 *  Returns the code length (offset of the comment, or full length if none) plus
 *  the comment start column (or -1). */
function splitComment(line: string, markers: readonly string[]): { codeEnd: number; commentAt: number } {
  let qs: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (qs) {
      if (c === qs) qs = null
      continue
    }
    if (c === '"' || c === "'") { qs = c; continue }
    for (const m of markers) {
      if (line.startsWith(m, i)) return { codeEnd: i, commentAt: i }
    }
  }
  return { codeEnd: line.length, commentAt: -1 }
}

/** Scan operand text for register/symbol/number/string tokens, collecting refs +
 *  tokens. Strings are masked first (their interior is never a symbol/number),
 *  then numbers; an identifier overlapping either span is skipped — so hex with
 *  letter digits (`$bff0`) and string contents (`icl 'nes.a65'`) are not mistaken
 *  for undefined symbols. `skipRefs` suppresses reference collection (still
 *  tokenizes) for directives whose operand is not symbols (MADS `opt h-`). */
function scanOperand(operand: string, base: number, d: AsmDialect, refs: LineRef[], tokens: SemTok[], skipRefs = false): void {
  // 1. Mask quoted strings ('...' / "..."); tokenize them, exclude their interior.
  const strSpans: [number, number][] = []
  for (let i = 0; i < operand.length; i++) {
    const q = operand[i]
    if (q !== '"' && q !== "'") continue
    let j = i + 1
    while (j < operand.length && operand[j] !== q) j++
    const end = j < operand.length ? j + 1 : operand.length // include the close quote
    strSpans.push([i, end])
    tokens.push({ kind: 'string', start: base + i, end: base + end })
    i = end - 1
  }
  const inSpan = (spans: [number, number][], pos: number): boolean => spans.some(([s, e]) => pos >= s && pos < e)

  // 2. Numbers outside strings (hex/bin/dec). Record spans so the ident scan can
  //    skip the letter digits of a hex literal ($bff0 → don't re-read `bff0`).
  const numSpans: [number, number][] = []
  NUMBER.lastIndex = 0
  for (let m = NUMBER.exec(operand); m; m = NUMBER.exec(operand)) {
    if (inSpan(strSpans, m.index)) continue
    numSpans.push([m.index, m.index + m[0].length])
    tokens.push({ kind: 'number', start: base + m.index, end: base + m.index + m[0].length })
  }

  // 3. Identifiers: registers, opcodes, else symbol references.
  IDENT.lastIndex = 0
  for (let m = IDENT.exec(operand); m; m = IDENT.exec(operand)) {
    const name = m[0]
    const idx = m.index
    if (inSpan(strSpans, idx) || inSpan(numSpans, idx)) continue
    // MADS data type-prefix: a single letter glued to a string (`dta c"NES"`,
    // `a"..."`) is a value type, not a symbol.
    if (name.length === 1 && (operand[idx + 1] === '"' || operand[idx + 1] === "'")) continue
    const start = base + idx
    if (isRegister(name, d)) {
      tokens.push({ kind: 'register', start, end: start + name.length })
    } else if (isOpcode(name, d)) {
      tokens.push({ kind: 'opcode', start, end: start + name.length })
    } else {
      if (!skipRefs) refs.push({ name, start, end: start + name.length })
      tokens.push({ kind: 'symbol', start, end: start + name.length })
    }
  }
}

/** Parse a single line. `lineStart` is the absolute offset of the line's first char. */
export function parseLine(line: string, lineStart: number, d: AsmDialect): ParsedLine {
  const refs: LineRef[] = []
  const tokens: SemTok[] = []
  const { codeEnd, commentAt } = splitComment(line, d.lineComment)
  if (commentAt >= 0) {
    tokens.push({ kind: 'comment', start: lineStart + commentAt, end: lineStart + line.length })
  }
  const code = line.slice(0, codeEnd)
  if (!code.trim()) return { refs, tokens }

  // 1. Equate definition (`name equ v`, `name = v`, `defc name = v`).
  const eq = d.equate.exec(code)
  if (eq) {
    const name = eq[1]
    const at = code.indexOf(name, eq.index)
    const start = lineStart + at
    // Scan only the right-hand side (after the `=`/`equ` separator) for refs, so
    // the `equ` keyword itself isn't read as a symbol reference.
    const rhs = code.slice(at + name.length)
    const sep = /^[\s:]*(?:=|equ)\s*/i.exec(rhs)
    const vOff = at + name.length + (sep ? sep[0].length : 0)
    const value = code.slice(vOff).trim()
    tokens.push({ kind: 'symbol', start, end: start + name.length })
    scanOperand(code.slice(vOff), lineStart + vOff, d, refs, tokens)
    return { def: { kind: 'equate', name, start, end: start + name.length, value }, refs, tokens }
  }

  // 2. Macro definition.
  const mac = d.macroStart.exec(code)
  if (mac && mac[1]) {
    const name = mac[1]
    const at = code.indexOf(name, mac.index)
    const start = lineStart + at
    tokens.push({ kind: 'macro', start, end: start + name.length })
    return { def: { kind: 'macro', name, start, end: start + name.length }, refs, tokens }
  }

  // 3. Optional label, then the statement (mnemonic + operand).
  let def: LineDef | undefined
  let rest = code
  let restBase = 0
  const colon = /^(\s*)(\.?[A-Za-z_@?][\w@?.]*)\s*:/.exec(code)
  if (colon) {
    const name = colon[2]
    const start = lineStart + colon[1].length
    def = { kind: 'label', name, start, end: start + name.length }
    tokens.push({ kind: 'label', start, end: start + name.length })
    restBase = colon[0].length
    rest = code.slice(restBase)
  } else if (/^\S/.test(code)) {
    // Column-0 token with no colon: a bare label (mads) iff it isn't a
    // mnemonic/directive.
    const first = /^[A-Za-z_@?][\w@?.]*/.exec(code)
    if (first && !isOpcode(first[0], d) && !isDirective(first[0], d)) {
      const name = first[0]
      const start = lineStart
      def = { kind: 'label', name, start, end: start + name.length }
      tokens.push({ kind: 'label', start, end: start + name.length })
      restBase = first[0].length
      rest = code.slice(restBase)
    }
  }

  // Statement: first token = mnemonic (opcode / directive / macro-call), rest = operand.
  let instr: LineInstr | undefined
  const mn = /^(\s*)([.\w@?]+)/.exec(rest)
  if (mn && mn[2]) {
    const tokTxt = mn[2]
    const tokStart = lineStart + restBase + mn[1].length
    const opEnd = restBase + mn[1].length + tokTxt.length
    // Directives whose operand is options/flags, not symbols (MADS `opt h-`) —
    // tokenize the operand but don't collect it as undefined-able references.
    let skipRefs = false
    if (isOpcode(tokTxt, d)) {
      tokens.push({ kind: 'opcode', start: tokStart, end: tokStart + tokTxt.length })
      instr = { mnemonic: tokTxt, operand: code.slice(opEnd).trim(), start: tokStart, end: tokStart + tokTxt.length }
    } else if (isDirective(tokTxt, d)) {
      tokens.push({ kind: 'directive', start: tokStart, end: tokStart + tokTxt.length })
      const bare = d.directivePrefix && tokTxt.startsWith(d.directivePrefix) ? tokTxt.slice(d.directivePrefix.length) : tokTxt
      skipRefs = d.rawOperandDirectives?.has(stripSize(bare, d).toLowerCase()) ?? false
    } else if (/[.A-Za-z_@?]/.test(tokTxt[0])) {
      // A bare identifier in the mnemonic slot = a macro / pseudo-op invocation →
      // reference (flagged mnemonic-slot so diagnose won't undefined-flag it).
      refs.push({ name: tokTxt, start: tokStart, end: tokStart + tokTxt.length, mnemonic: true })
      tokens.push({ kind: 'macro', start: tokStart, end: tokStart + tokTxt.length })
    }
    scanOperand(code.slice(opEnd), lineStart + opEnd, d, refs, tokens, skipRefs)
  }

  return { def, refs, tokens, instr }
}

/** The identifier under `offset` in `text` (the symbol the cursor is on), or null. */
export function wordAt(text: string, offset: number): { name: string; start: number; end: number } | null {
  if (offset < 0 || offset > text.length) return null
  const isWord = (c: string) => /[A-Za-z0-9_@?.]/.test(c)
  let s = offset
  let e = offset
  while (s > 0 && isWord(text[s - 1])) s--
  while (e < text.length && isWord(text[e])) e++
  if (s === e) return null
  const name = text.slice(s, e)
  if (!/^\.?[A-Za-z_@?]/.test(name)) return null
  return { name, start: s, end: e }
}
