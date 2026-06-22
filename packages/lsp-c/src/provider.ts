import type {
  BuildDiagnostic,
  CompletionKind,
  DocSymbol,
  DocSymbolKind,
  LanguageProvider,
  Loc,
  ProviderCompletion,
  ProviderConfig,
  RenameEdit,
  SemToken,
  SemanticDiagnostic,
  SignatureHelp,
  SourceFile,
  Span,
} from '@madside/lsp-core'
import type { CDialect } from './dialect'
import {
  completeAt,
  definitionAt,
  diagnoseC,
  documentSymbols,
  hoverAt,
  indexC,
  parseBuildOutput,
  prepareRenameAt,
  referencesAt,
  renameAt,
  semanticTokens,
  signatureHelpAt,
  type CDiagnosticSeverity,
  type CDocSymbolKind,
  type CIndex,
  type CSymbolKind,
  type CTokenType,
} from './engine'

// The generic C LanguageProvider: a stateful adapter that drives the
// dialect-agnostic engine (./engine) and maps its results to @madside/lsp-core's
// generic offset/text vocabulary. A CDialect (./dialect) supplies the only
// dialect-specific knobs (decorators, diagnostic sources, triggers). lsp-core
// owns the line/column ↔ offset and generic ↔ LSP-wire conversions, so this file
// never touches a vscode type (cf. cc65-intel's server.ts, which mapped straight
// to vscode — that mapping is replicated here, one hop earlier).

// engine CSymbolKind → generic CompletionKind.
const COMPLETION_KIND: Record<CSymbolKind, CompletionKind> = {
  function: 'function',
  macro: 'constant',
  type: 'type',
  global: 'variable',
  field: 'field',
}

// engine CDocSymbolKind → generic DocSymbolKind.
const DOC_SYMBOL_KIND: Record<CDocSymbolKind, DocSymbolKind> = {
  function: 'function',
  struct: 'struct',
  union: 'union',
  enum: 'enum',
  typedef: 'class',
  variable: 'variable',
}

// engine CDiagnosticSeverity → generic DiagnosticSeverity (the engine's `note`
// is generic `info`).
const SEVERITY: Record<CDiagnosticSeverity, SemanticDiagnostic['severity']> = {
  error: 'error',
  warning: 'warning',
  note: 'info',
}

// The semantic-token legend (ordered). A token's `tokenType` is the index into
// this array; the engine's `field` maps to the standard `property` (index 4).
const SEMANTIC_TOKEN_TYPES = ['type', 'function', 'macro', 'parameter', 'property', 'variable']
const TOKEN_INDEX: Record<CTokenType, number> = {
  type: 0,
  function: 1,
  macro: 2,
  parameter: 3,
  field: 4, // → property
  variable: 5,
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Any `#include <h>` / `#include "h"` line.
const INCLUDE_RE = /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"]+)[>"].*$/gm

/** Where (offset into `text`) and what to insert so `header` is `#include`d, or
 *  null if it already is. The edit goes after the last existing `#include` (else
 *  at the top of the file). Pure C-generic text logic — no engine, no dialect. */
function includeInsert(text: string, header: string): { offset: number; newText: string } | null {
  if (new RegExp(`^[ \\t]*#[ \\t]*include[ \\t]*[<"]${escapeRe(header)}[>"]`, 'm').test(text)) {
    return null
  }
  let last: RegExpExecArray | null = null
  INCLUDE_RE.lastIndex = 0
  for (let m = INCLUDE_RE.exec(text); m; m = INCLUDE_RE.exec(text)) last = m
  if (!last) return { offset: 0, newText: `#include <${header}>\n` }
  const lineEnd = text.indexOf('\n', last.index + last[0].length)
  if (lineEnd === -1) return { offset: text.length, newText: `\n#include <${header}>` }
  return { offset: lineEnd + 1, newText: `#include <${header}>\n` }
}

/** Build a @madside/lsp-core LanguageProvider for the C dialect `dialect`. */
export function createCProvider(dialect: CDialect): LanguageProvider {
  const decorators = dialect.decorators
  const extraDecls = dialect.extraDecls
  let sysrootHeaders: SourceFile[] = []
  let defines: Record<string, string> | undefined
  let files: SourceFile[] = []
  let index: CIndex = indexC([], { decorators, extraDecls })

  const rebuild = (): void => {
    index = indexC(files, { sysrootHeaders, defines, decorators, extraDecls })
  }

  return {
    languageId: 'c',
    completionTriggers: dialect.completionTriggers ?? ['.', '>'],
    signatureTriggers: dialect.signatureTriggers ?? ['(', ','],
    semanticTokenTypes: SEMANTIC_TOKEN_TYPES,
    diagnosticSource: dialect.diagnosticSource,
    buildDiagnosticSource: dialect.buildDiagnosticSource,
    buildOutputNotification: dialect.buildOutputNotification,

    configure(config: ProviderConfig): void {
      // The host's generic `sysrootFiles` are the engine's `sysrootHeaders`.
      if (config.sysrootFiles) sysrootHeaders = config.sysrootFiles
      if (config.defines) defines = config.defines
    },

    update(next: SourceFile[]): void {
      files = next
      rebuild()
    },

    complete(_uri: string, text: string, offset: number): ProviderCompletion[] {
      return completeAt(index, text, offset, decorators).map((item) => {
        // A symbol from a sysroot header the buffer doesn't include yet gets an
        // auto-`#include` edit the host applies on accept (C-generic).
        const ins = item.header ? includeInsert(text, item.header) : null
        return {
          label: item.label,
          kind: COMPLETION_KIND[item.kind],
          ...(item.detail !== undefined ? { detail: item.detail } : {}),
          ...(ins
            ? { additionalEdits: [{ start: ins.offset, end: ins.offset, newText: ins.newText }] }
            : {}),
          // The declaring header rides along for clients that want it.
          ...(item.header ? { data: { header: item.header } } : {}),
        }
      })
    },

    hover(_uri: string, text: string, offset: number): string | null {
      return hoverAt(index, text, offset, decorators)?.contents ?? null
    },

    definition(_uri: string, text: string, offset: number): Loc | null {
      return definitionAt(index, text, offset, decorators)
    },

    references(_uri: string, text: string, offset: number, includeDeclaration: boolean): Loc[] {
      let refs = referencesAt(files, text, offset, decorators)
      if (!includeDeclaration) {
        const def = definitionAt(index, text, offset, decorators)
        if (def) {
          refs = refs.filter(
            (r) => !(r.uri === def.uri && r.start === def.start && r.end === def.end),
          )
        }
      }
      return refs
    },

    prepareRename(_uri: string, text: string, offset: number): Span | null {
      return prepareRenameAt(text, offset)
    },

    rename(_uri: string, text: string, offset: number, newName: string): RenameEdit[] {
      return renameAt(files, text, offset, newName, decorators)
    },

    semanticTokens(_uri: string, text: string): SemToken[] {
      return semanticTokens(index, text, decorators).map((t) => ({
        start: t.start,
        end: t.end,
        tokenType: TOKEN_INDEX[t.type],
      }))
    },

    signatureHelp(_uri: string, text: string, offset: number): SignatureHelp | null {
      const help = signatureHelpAt(index, text, offset)
      if (!help) return null
      return {
        label: help.label,
        parameters: help.parameters,
        activeParameter: help.activeParameter,
      }
    },

    documentSymbols(_uri: string, text: string): DocSymbol[] {
      return documentSymbols(text, decorators).map((s) => ({
        name: s.name,
        kind: DOC_SYMBOL_KIND[s.kind],
        start: s.start,
        end: s.end,
        selectionStart: s.selectionStart,
        selectionEnd: s.selectionEnd,
      }))
    },

    diagnose(_uri: string, text: string): SemanticDiagnostic[] {
      return diagnoseC(index, text, decorators).map((d) => ({
        start: d.start,
        end: d.end,
        severity: SEVERITY[d.severity],
        message: d.message,
      }))
    },

    parseBuildOutput(output: string): BuildDiagnostic[] {
      return parseBuildOutput(output).map((d) => ({
        file: d.file,
        line: d.line,
        column: d.column,
        severity: SEVERITY[d.severity],
        message: d.message,
      }))
    },

    resolveText(uri: string): string | undefined {
      // Go-to-definition into a header: the host's read-only sysroot files.
      return sysrootHeaders.find((h) => h.path === uri)?.text
    },
  }
}
