// Provider operations over an AsmIndex: go-to-definition, find-references,
// rename, hover, completion, document symbols, diagnostics, and semantic tokens.
// Pure functions of (index, dialect, …) so they're trivially testable without a
// transport.

import type {
  DocSymbol,
  Loc,
  ProviderCompletion,
  RenameEdit,
  SemanticDiagnostic,
  SemToken,
  Span,
} from '@madside/lsp-core'
import type { AsmDialect } from '../dialect'
import type { OpcodeInfo } from '../cpu'
import type { AsmIndex } from './types'
import { isOpcodeTok, mnemonicBase, normalize, parseLine, wordAt, type SemKind } from './tokenize'

/** Semantic-token legend — index = the SemKind's position here. The host client
 *  maps these names to editor highlight styles. */
export const SEM_LEGEND: SemKind[] = [
  'label', 'opcode', 'directive', 'register', 'symbol', 'macro', 'number', 'string', 'comment',
]
const LEGEND_INDEX = new Map(SEM_LEGEND.map((k, i) => [k, i]))

const isOpcode = isOpcodeTok
const isRegister = (name: string, d: AsmDialect) => d.registers.has(name.toUpperCase())
const isDirective = (name: string, d: AsmDialect) => {
  const bare = d.directivePrefix && name.startsWith(d.directivePrefix) ? name.slice(d.directivePrefix.length) : name
  return d.directives.has(bare.toLowerCase())
}

/** The renamable/resolvable symbol under the cursor, or null for opcodes /
 *  registers / directives / non-words. */
function symbolAt(text: string, offset: number, d: AsmDialect): { name: string; start: number; end: number } | null {
  const w = wordAt(text, offset)
  if (!w) return null
  if (isOpcode(w.name, d) || isRegister(w.name, d) || isDirective(w.name, d)) return null
  return w
}

export function definitionAt(index: AsmIndex, d: AsmDialect, _uri: string, text: string, offset: number): Loc | null {
  const w = symbolAt(text, offset, d)
  if (!w) return null
  const defs = index.defs.get(normalize(w.name, d))
  if (!defs || defs.length === 0) return null
  const def = defs[0]
  return { uri: def.uri, start: def.start, end: def.end }
}

export function referencesAt(
  index: AsmIndex, d: AsmDialect, _uri: string, text: string, offset: number, includeDeclaration: boolean,
): Loc[] {
  const w = symbolAt(text, offset, d)
  if (!w) return []
  const key = normalize(w.name, d)
  const out: Loc[] = []
  if (includeDeclaration) {
    for (const def of index.defs.get(key) ?? []) out.push({ uri: def.uri, start: def.start, end: def.end })
  }
  for (const ref of index.refs.get(key) ?? []) out.push({ uri: ref.uri, start: ref.start, end: ref.end })
  return out
}

export function prepareRenameAt(text: string, offset: number, d: AsmDialect): Span | null {
  const w = symbolAt(text, offset, d)
  return w ? { start: w.start, end: w.end } : null
}

export function renameAt(
  index: AsmIndex, d: AsmDialect, _uri: string, text: string, offset: number, newName: string,
): RenameEdit[] {
  const w = symbolAt(text, offset, d)
  if (!w) return []
  const key = normalize(w.name, d)
  const edits: RenameEdit[] = []
  for (const def of index.defs.get(key) ?? []) edits.push({ uri: def.uri, start: def.start, end: def.end, newText: newName })
  for (const ref of index.refs.get(key) ?? []) edits.push({ uri: ref.uri, start: ref.start, end: ref.end, newText: newName })
  return edits
}

function formatOpcode(mnemonic: string, info: OpcodeInfo): string {
  const lines = [`**${mnemonic}** — ${info.desc}`, '']
  lines.push(`Flags: ${info.flags ? `\`${info.flags}\`` : '—'}`)
  if (info.modes.length > 0) {
    lines.push('', 'Addressing modes:')
    for (const m of info.modes) {
      lines.push(m.syntax ? `- ${m.mode} \`${m.syntax}\`` : `- ${m.mode}`)
    }
  }
  return lines.join('\n')
}

export function hoverAt(index: AsmIndex, d: AsmDialect, _uri: string, text: string, offset: number): string | null {
  const w = wordAt(text, offset)
  if (!w) return null
  // A defined symbol wins over an opcode-name collision.
  const defs = index.defs.get(normalize(w.name, d))
  if (defs && defs.length > 0) {
    const def = defs[0]
    const where = `${def.uri}:${def.line}`
    const head = `**${def.name}** _(${def.kind})_`
    if (def.kind === 'equate' && def.value) return `${head}\n\n= \`${def.value}\`\n\n${where}`
    return `${head}\n\n${where}`
  }
  const base = mnemonicBase(w.name, d)
  if (base) {
    const info = d.cpu.info[base]
    if (info) return formatOpcode(base, info)
  }
  return null
}

export function completeAt(index: AsmIndex, d: AsmDialect): ProviderCompletion[] {
  const out: ProviderCompletion[] = []
  for (const op of d.cpu.mnemonics) {
    out.push({ label: op.toLowerCase(), kind: 'keyword', detail: d.cpu.info[op]?.desc })
  }
  for (const dir of d.directives) {
    out.push({ label: `${d.directivePrefix}${dir}`, kind: 'keyword', detail: 'directive' })
  }
  for (const [, defs] of index.defs) {
    const def = defs[0]
    const kind = def.kind === 'equate' ? 'constant' : def.kind === 'macro' ? 'function' : 'variable'
    out.push({ label: def.name, kind, detail: def.kind })
  }
  return out
}

const DOC_KIND = { label: 'function', equate: 'constant', macro: 'function' } as const

export function outline(index: AsmIndex, uri: string): DocSymbol[] {
  const bucket = index.byUri.get(uri)
  if (!bucket) return []
  return bucket.defs.map((def) => ({
    name: def.name,
    kind: DOC_KIND[def.kind],
    start: def.start,
    end: def.end,
    selectionStart: def.start,
    selectionEnd: def.end,
  }))
}

/** Analysis diagnostics: duplicate definitions + references with no definition.
 *  `defined` carries host-supplied names (sysroot / target defines) treated as
 *  defined so they don't read as undefined. */
export function diagnoseFile(
  index: AsmIndex, d: AsmDialect, uri: string, defined: ReadonlySet<string>,
): SemanticDiagnostic[] {
  const bucket = index.byUri.get(uri)
  if (!bucket) return []
  const out: SemanticDiagnostic[] = []

  // Duplicate definitions of the same name in this file.
  const seen = new Map<string, number>()
  for (const def of bucket.defs) {
    if (def.kind === 'macro') continue
    const key = normalize(def.name, d)
    seen.set(key, (seen.get(key) ?? 0) + 1)
    if ((seen.get(key) ?? 0) > 1) {
      out.push({ start: def.start, end: def.end, severity: 'warning', message: `Duplicate definition of '${def.name}'` })
    }
  }

  // References with no definition anywhere in the project.
  for (const ref of bucket.refs) {
    const key = normalize(ref.name, d)
    if (index.defs.has(key)) continue
    if (defined.has(key) || defined.has(ref.name)) continue
    // Skip local/anonymous label conventions (mads `?`, ca65 `@`, leading `.`).
    if (/^[@?.]/.test(ref.name)) continue
    out.push({ start: ref.start, end: ref.end, severity: 'warning', message: `Undefined symbol '${ref.name}'` })
  }

  // Addressing-mode validation (6502 dialects): an opcode used with a mode it
  // doesn't support won't assemble. Re-scan the file for instruction statements.
  if (d.addressingModes) out.push(...diagnoseAddressing(index, d, uri))
  return out
}

/** Map an operand's syntax to the 6502 addressing mode(s) it could be. zeropage
 *  vs absolute can't be told apart without the operand's value, so the indexed +
 *  direct shapes carry both — validation accepts the opcode if it supports any. */
function detectMode(operand: string): { name: string; candidates: string[] } {
  const op = operand.trim()
  if (op === '') return { name: 'implied', candidates: ['implied', 'accumulator'] }
  if (/^[Aa]$/.test(op)) return { name: 'accumulator', candidates: ['accumulator'] }
  if (op.startsWith('#')) return { name: 'immediate', candidates: ['immediate'] }
  if (/^\(.*,\s*[Xx]\s*\)$/.test(op)) return { name: '(indirect,X)', candidates: ['(indirect,X)'] }
  if (/^\(.*\)\s*,\s*[Yy]$/.test(op)) return { name: '(indirect),Y', candidates: ['(indirect),Y'] }
  if (/^\(.*\)$/.test(op)) return { name: 'indirect', candidates: ['indirect'] }
  if (/,\s*[Xx]$/.test(op)) return { name: 'X-indexed', candidates: ['zeropage,X', 'absolute,X'] }
  if (/,\s*[Yy]$/.test(op)) return { name: 'Y-indexed', candidates: ['zeropage,Y', 'absolute,Y'] }
  return { name: 'absolute', candidates: ['zeropage', 'absolute', 'relative'] }
}

function diagnoseAddressing(index: AsmIndex, d: AsmDialect, uri: string): SemanticDiagnostic[] {
  const file = index.files.get(uri)
  if (!file) return []
  const out: SemanticDiagnostic[] = []
  const text = file.text
  let lineStart = 0
  for (;;) {
    const nl = text.indexOf('\n', lineStart)
    const end = nl === -1 ? text.length : nl
    const { instr } = parseLine(text.slice(lineStart, end), lineStart, d)
    if (instr) {
      const info = d.cpu.info[instr.mnemonic.toUpperCase()]
      if (info) {
        const supported = new Set(info.modes.map((m) => m.mode))
        const det = detectMode(instr.operand)
        if (!det.candidates.some((c) => supported.has(c))) {
          const mn = instr.mnemonic.toUpperCase()
          const message =
            instr.operand === '' ? `\`${mn}\` requires an operand`
              : supported.has('implied') && supported.size === 1 ? `\`${mn}\` takes no operand`
                : `\`${mn}\` does not support ${det.name} addressing`
          out.push({ start: instr.start, end: instr.end, severity: 'error', message })
        }
      }
    }
    if (nl === -1) break
    lineStart = nl + 1
  }
  return out
}

export function semanticTokensFor(d: AsmDialect, text: string): SemToken[] {
  const out: SemToken[] = []
  let lineStart = 0
  for (;;) {
    const nl = text.indexOf('\n', lineStart)
    const end = nl === -1 ? text.length : nl
    const parsed = parseLine(text.slice(lineStart, end), lineStart, d)
    for (const t of parsed.tokens) {
      const idx = LEGEND_INDEX.get(t.kind)
      if (idx !== undefined) out.push({ start: t.start, end: t.end, tokenType: idx })
    }
    if (nl === -1) break
    lineStart = nl + 1
  }
  return out
}
