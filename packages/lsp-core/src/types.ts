// The language-agnostic contract @madside/lsp-core speaks. A LanguageProvider is
// a pure-data engine: positions are character OFFSETS into the source text,
// never line/column — line/column is the LSP transport's concern (server.ts),
// kept out of the engine so the same provider can serve any front-end.
//
// lsp-core knows NOTHING about C, cc65, z80, or any language. It routes LSP
// requests to these methods and maps the returned generic vocab to LSP wire
// types. A language = a package implementing LanguageProvider.

/** A source file the provider indexes. `path` doubles as the document URI key. */
export interface SourceFile {
  path: string
  text: string
}

/** A character-offset range inside a file (`uri`). */
export interface Loc {
  uri: string
  start: number
  end: number
}

/** A character-offset range inside the *active* document. */
export interface Span {
  start: number
  end: number
}

/** Generic completion-item kind. lsp-core maps it to LSP `CompletionItemKind`.
 *  Languages pick from this set (extend lsp-core's map to add more). */
export type CompletionKind =
  | 'function'
  | 'variable'
  | 'type'
  | 'field'
  | 'constant'
  | 'keyword'
  | 'snippet'
  | 'module'

/** A completion result in offset/text terms. `additionalEdits` carry any
 *  language-specific side edits (e.g. an auto-import) the host applies on accept;
 *  `data` rides along to the client untouched. */
export interface ProviderCompletion {
  label: string
  kind: CompletionKind
  detail?: string
  additionalEdits?: { start: number; end: number; newText: string }[]
  data?: unknown
}

/** Generic document-symbol kind → LSP `SymbolKind`. */
export type DocSymbolKind =
  | 'function'
  | 'struct'
  | 'union'
  | 'enum'
  | 'class'
  | 'variable'
  | 'constant'
  | 'namespace'

export interface DocSymbol {
  name: string
  kind: DocSymbolKind
  start: number
  end: number
  selectionStart: number
  selectionEnd: number
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

/** A semantic (analysis-driven) diagnostic in offsets, against the active doc. */
export interface SemanticDiagnostic {
  start: number
  end: number
  severity: DiagnosticSeverity
  message: string
}

/** A build/compiler diagnostic in 1-based line/column, keyed by a file path the
 *  toolchain printed (lsp-core resolves it to an open-document URI by suffix). */
export interface BuildDiagnostic {
  file: string
  line: number
  column: number
  severity: DiagnosticSeverity
  message: string
}

export interface SignatureHelp {
  label: string
  parameters: string[]
  activeParameter: number
}

/** A single text replacement (offset range → newText) in file `uri`. */
export interface RenameEdit {
  uri: string
  start: number
  end: number
  newText: string
}

/** A semantic token: an offset range tagged with `tokenType` — an INDEX into the
 *  provider's `semanticTokenTypes` legend. */
export interface SemToken {
  start: number
  end: number
  tokenType: number
}

/** Host-supplied configuration sent once at `initialize` (the engine never
 *  bundles these): read-only sysroot files + the active target's preprocessor
 *  defines. Shape is generic; a language decides what it does with them. */
export interface ProviderConfig {
  /** Read-only files the host mounts (e.g. a toolchain sysroot's headers). */
  sysrootFiles?: SourceFile[]
  /** Predefined macros/symbols for the active target. */
  defines?: Record<string, string>
}

/** The language engine lsp-core drives. Stateful: `update` rebuilds the index +
 *  retains the file set; the queries below read that state plus the live text. */
export interface LanguageProvider {
  /** LSP languageId this provider serves (e.g. 'c'). */
  readonly languageId: string
  /** Completion trigger characters (e.g. ['.', '>']). */
  readonly completionTriggers?: string[]
  /** Signature-help trigger characters (e.g. ['(', ',']). */
  readonly signatureTriggers?: string[]
  /** The semantic-token-type legend (ordered). A token's `tokenType` is an index
   *  into this array. */
  readonly semanticTokenTypes: string[]
  /** `source` for analysis diagnostics (e.g. 'cc65-intel'). */
  readonly diagnosticSource: string
  /** `source` for build-output diagnostics (e.g. 'cc65'). */
  readonly buildDiagnosticSource: string
  /** Custom JSON-RPC notification the host pushes raw build output on. Omit to
   *  disable the build-diagnostics channel. */
  readonly buildOutputNotification?: string

  /** Apply host configuration (sysroot files + defines). Called at initialize. */
  configure(config: ProviderConfig): void
  /** Rebuild the index from the current open documents + retain them for
   *  cross-file queries. Called on initialize + every document change. */
  update(files: SourceFile[]): void

  complete(uri: string, text: string, offset: number): ProviderCompletion[]
  hover(uri: string, text: string, offset: number): string | null
  definition(uri: string, text: string, offset: number): Loc | null
  references(uri: string, text: string, offset: number, includeDeclaration: boolean): Loc[]
  prepareRename(uri: string, text: string, offset: number): Span | null
  rename(uri: string, text: string, offset: number, newName: string): RenameEdit[]
  semanticTokens(uri: string, text: string): SemToken[]
  signatureHelp(uri: string, text: string, offset: number): SignatureHelp | null
  documentSymbols(uri: string, text: string): DocSymbol[]
  diagnose(uri: string, text: string): SemanticDiagnostic[]
  /** Parse raw toolchain output into build diagnostics. Required iff
   *  `buildOutputNotification` is set. */
  parseBuildOutput?(output: string): BuildDiagnostic[]
  /** Resolve the text of a non-open target (e.g. a sysroot header) so
   *  go-to-definition can land in it. */
  resolveText?(uri: string): string | undefined
}
