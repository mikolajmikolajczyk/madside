// Engine barrel for @madside/lsp-c — the dialect-agnostic C intelligence engine
// (parse + resolve + complete/hover/…). Pure data in/out; no editor/LSP/DOM
// types leak across this boundary. The provider (../provider) adapts these to
// the @madside/lsp-core LanguageProvider contract; tests import them directly.

export type {
  SourceFile,
  CSymbolKind,
  CLocation,
  CField,
  CType,
  CSymbol,
  CIndex,
  CompletionItem,
  HoverInfo,
  IndexOptions,
  CDiagnostic,
  CDiagnosticSeverity,
  CSemanticDiagnostic,
  CSignatureHelp,
  CDocSymbolKind,
  CDocumentSymbol,
  CRenameEdit,
  CTokenType,
  CSemanticToken,
} from './types'

export { parseC } from './parse'
export { indexC } from './index-c'
export { completeAt } from './complete'
export { hoverAt } from './hover'
export { definitionAt } from './definition'
export { parseBuildOutput } from './diagnostics'
export { diagnoseC } from './diagnose'
export { signatureHelpAt } from './signature'
export { documentSymbols } from './outline'
export { findReferences, referencesAt } from './references'
export { renameAt, prepareRenameAt } from './rename'
export { semanticTokens } from './tokens'
