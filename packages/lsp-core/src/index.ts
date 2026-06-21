// @madside/lsp-core — language-agnostic LSP framework. Pair `startServer` with a
// transport (browser worker / node stdio) and a LanguageProvider:
//
//   import { startServer } from '@madside/lsp-core'
//   import { createConnection } from 'vscode-languageserver/browser'
//   startServer(createConnection(reader, writer), myProvider)
//
// lsp-core knows no language; a language is a package implementing LanguageProvider.

export { startServer } from './server'
export type {
  LanguageProvider,
  ProviderConfig,
  SourceFile,
  Loc,
  Span,
  CompletionKind,
  ProviderCompletion,
  DocSymbolKind,
  DocSymbol,
  DiagnosticSeverity,
  SemanticDiagnostic,
  BuildDiagnostic,
  SignatureHelp,
  RenameEdit,
  SemToken,
} from './types'
