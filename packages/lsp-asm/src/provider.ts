// createAsmProvider(dialect) — adapts the generic assembly engine to the
// @madside/lsp-core LanguageProvider contract. Stateful: `configure` stores the
// sysroot/defines, `update` rebuilds the project index, and the query methods
// read that index. All language-specific knowledge lives in the dialect profile
// (./dialect) + the CPU tables (./cpu); this adapter is dialect-agnostic.

import type {
  DocSymbol,
  LanguageProvider,
  Loc,
  ProviderCompletion,
  ProviderConfig,
  RenameEdit,
  SemanticDiagnostic,
  SemToken,
  SignatureHelp,
  SourceFile,
  Span,
} from '@madside/lsp-core'
import type { AsmDialect } from './dialect'
import {
  SEM_LEGEND,
  buildIndex,
  completeAt,
  definitionAt,
  diagnoseFile,
  emptyIndex,
  hoverAt,
  normalize,
  outline,
  prepareRenameAt,
  referencesAt,
  renameAt,
  semanticTokensFor,
  type AsmIndex,
} from './engine'

export function createAsmProvider(dialect: AsmDialect): LanguageProvider {
  let index: AsmIndex = emptyIndex()
  let sysroot: SourceFile[] = []
  // Names the host declares predefined (target registers etc.) — kept out of the
  // undefined-symbol check. Stored both raw + normalized.
  let defined: Set<string> = new Set()

  return {
    languageId: 'asm',
    completionTriggers: ['.'],
    signatureTriggers: [],
    semanticTokenTypes: [...SEM_LEGEND],
    diagnosticSource: dialect.diagnosticSource,
    buildDiagnosticSource: dialect.buildDiagnosticSource,
    // The build-output diagnostics channel is wired in a later phase; until then
    // the engine surfaces analysis diagnostics only.

    configure(config: ProviderConfig): void {
      // Store host config; `update` (called right after initialize, and on every
      // change) rebuilds the index from sysroot + the open files.
      sysroot = config.sysrootFiles ?? []
      defined = new Set()
      for (const name of Object.keys(config.defines ?? {})) {
        defined.add(name)
        defined.add(normalize(name, dialect))
      }
    },

    update(files: SourceFile[]): void {
      index = buildIndex([...sysroot, ...files].filter(distinctByPath()), dialect)
    },

    complete(): ProviderCompletion[] {
      return completeAt(index, dialect)
    },
    hover(uri: string, text: string, offset: number): string | null {
      return hoverAt(index, dialect, uri, text, offset)
    },
    definition(uri: string, text: string, offset: number): Loc | null {
      return definitionAt(index, dialect, uri, text, offset)
    },
    references(uri: string, text: string, offset: number, includeDeclaration: boolean): Loc[] {
      return referencesAt(index, dialect, uri, text, offset, includeDeclaration)
    },
    prepareRename(_uri: string, text: string, offset: number): Span | null {
      return prepareRenameAt(text, offset, dialect)
    },
    rename(uri: string, text: string, offset: number, newName: string): RenameEdit[] {
      return renameAt(index, dialect, uri, text, offset, newName)
    },
    semanticTokens(_uri: string, text: string): SemToken[] {
      return semanticTokensFor(dialect, text)
    },
    signatureHelp(): SignatureHelp | null {
      return null
    },
    documentSymbols(uri: string): DocSymbol[] {
      return outline(index, uri)
    },
    diagnose(uri: string): SemanticDiagnostic[] {
      return diagnoseFile(index, dialect, uri, defined)
    },
  }
}

/** Dedup a file list by path, keeping the last occurrence. */
function distinctByPath() {
  const seen = new Set<string>()
  return (f: SourceFile): boolean => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  }
}
