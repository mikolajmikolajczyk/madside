import {
  type Connection,
  type Diagnostic,
  type InitializeResult,
  type SemanticTokensLegend,
  CompletionItemKind,
  DiagnosticSeverity,
  MarkupKind,
  SemanticTokensBuilder,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type {
  BuildDiagnostic,
  CompletionKind,
  DiagnosticSeverity as ProviderSeverity,
  DocSymbolKind,
  LanguageProvider,
  Loc,
  ProviderConfig,
  SourceFile,
} from './types'

// The language-agnostic LSP server. `startServer(connection, provider)` wires a
// transport (browser worker / node stdio) to a LanguageProvider: it owns the
// document registry, offset↔position conversion, capability advertisement, and
// publishDiagnostics; every language-specific decision is delegated to the
// provider. lsp-core imports NO language package.

const COMPLETION_KIND: Record<CompletionKind, CompletionItemKind> = {
  function: CompletionItemKind.Function,
  variable: CompletionItemKind.Variable,
  type: CompletionItemKind.Struct,
  field: CompletionItemKind.Field,
  constant: CompletionItemKind.Constant,
  keyword: CompletionItemKind.Keyword,
  snippet: CompletionItemKind.Snippet,
  module: CompletionItemKind.Module,
}

const SYMBOL_KIND: Record<DocSymbolKind, SymbolKind> = {
  function: SymbolKind.Function,
  struct: SymbolKind.Struct,
  union: SymbolKind.Struct, // LSP has no Union kind
  enum: SymbolKind.Enum,
  class: SymbolKind.Class,
  variable: SymbolKind.Variable,
  constant: SymbolKind.Constant,
  namespace: SymbolKind.Namespace,
}

const SEVERITY: Record<ProviderSeverity, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
}

interface BuildOutputParams {
  output: string
}

/** Run the agnostic LSP server for `provider` over `connection`. The transport
 *  packages (browser worker / node stdio) call this with their connection. */
export function startServer(connection: Connection, provider: LanguageProvider): void {
  const documents = new TextDocuments(TextDocument)
  let sysrootFiles: SourceFile[] = []

  const allFiles = (): SourceFile[] =>
    documents.all().map((d) => ({ path: d.uri, text: d.getText() }))

  const reindex = (): void => provider.update(allFiles())

  const rangeOf = (doc: TextDocument, start: number, end: number) => ({
    start: doc.positionAt(start),
    end: doc.positionAt(end),
  })

  // An engine offset range → an LSP Location against its (open) document.
  const toLocation = (loc: Loc): { uri: string; range: ReturnType<typeof rangeOf> } | null => {
    const target = documents.get(loc.uri)
    return target ? { uri: loc.uri, range: rangeOf(target, loc.start, loc.end) } : null
  }

  // ---- Diagnostics ----------------------------------------------------------
  // Two streams share each document's diagnostic list (publishDiagnostics
  // replaces it wholesale, so they're merged per URI): the provider's *semantic*
  // diagnostics (recomputed live on every change) and *build-output* diagnostics
  // the host pushes. A client tells them apart by `source`.
  const buildDiags = new Map<string, Diagnostic[]>()

  // Match a toolchain-printed path to an open document's URI by suffix
  // (`main.c` ↔ `file:///proj/main.c`). Unmatched files fall back to a `file://`
  // URI so non-open files (headers pulled into the build) still get squiggles.
  const resolveUri = (file: string): string => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return file
    const norm = file.replace(/\\/g, '/')
    const open = documents
      .all()
      .find((d) => d.uri === norm || decodeURIComponent(d.uri).endsWith('/' + norm))
    return open ? open.uri : 'file://' + (norm.startsWith('/') ? norm : '/' + norm)
  }

  // A build diagnostic's 1-based line/col → a 0-based Range. When the target doc
  // is open, extend the range to the end of the line so the squiggle is visible.
  const buildDiagnostic = (d: BuildDiagnostic, uri: string): Diagnostic => {
    const start = { line: Math.max(0, d.line - 1), character: Math.max(0, d.column - 1) }
    const lineText = documents.get(uri)?.getText().split(/\r?\n/)[start.line]
    const end =
      lineText !== undefined ? { line: start.line, character: lineText.length } : { ...start }
    return {
      range: { start, end },
      severity: SEVERITY[d.severity],
      source: provider.buildDiagnosticSource,
      message: d.message,
    }
  }

  // Analysis-driven diagnostics for one open document (offsets → ranges).
  const semanticDiagnostics = (uri: string): Diagnostic[] => {
    const doc = documents.get(uri)
    if (!doc) return []
    return provider.diagnose(uri, doc.getText()).map((d) => ({
      range: rangeOf(doc, d.start, d.end),
      severity: SEVERITY[d.severity],
      source: provider.diagnosticSource,
      message: d.message,
    }))
  }

  const publish = (uri: string): void => {
    void connection.sendDiagnostics({
      uri,
      diagnostics: [...(buildDiags.get(uri) ?? []), ...semanticDiagnostics(uri)],
    })
  }

  // A reindex touches cross-file analysis, so every open doc's semantic
  // diagnostics may change — republish them all (plus any build-diagnostic URI).
  const publishAll = (): void => {
    const uris = new Set<string>([...documents.all().map((d) => d.uri), ...buildDiags.keys()])
    for (const uri of uris) publish(uri)
  }

  connection.onInitialize((params): InitializeResult => {
    const opts = params.initializationOptions as ProviderConfig | undefined
    if (opts) {
      if (opts.sysrootFiles) sysrootFiles = opts.sysrootFiles
      provider.configure(opts)
    }
    const legend: SemanticTokensLegend = {
      tokenTypes: provider.semanticTokenTypes,
      tokenModifiers: [],
    }
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        completionProvider: { triggerCharacters: provider.completionTriggers },
        hoverProvider: true,
        definitionProvider: true,
        signatureHelpProvider: { triggerCharacters: provider.signatureTriggers },
        documentSymbolProvider: true,
        referencesProvider: true,
        renameProvider: { prepareProvider: true },
        semanticTokensProvider: { legend, full: true },
      },
    }
  })

  connection.onInitialized(() => {
    reindex()
    publishAll()
  })
  documents.onDidChangeContent(() => {
    reindex()
    publishAll()
  })
  documents.onDidClose((e) => {
    buildDiags.delete(e.document.uri)
    reindex()
    void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] })
    publishAll()
  })

  connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return []
    const offset = doc.offsetAt(params.position)
    return provider.complete(doc.uri, doc.getText(), offset).map((item) => ({
      label: item.label,
      kind: COMPLETION_KIND[item.kind],
      detail: item.detail,
      ...(item.data !== undefined ? { data: item.data } : {}),
      ...(item.additionalEdits && item.additionalEdits.length
        ? {
            additionalTextEdits: item.additionalEdits.map((e) => ({
              range: rangeOf(doc, e.start, e.end),
              newText: e.newText,
            })),
          }
        : {}),
    }))
  })

  connection.onSignatureHelp((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const help = provider.signatureHelp(doc.uri, doc.getText(), doc.offsetAt(params.position))
    if (!help) return null
    return {
      signatures: [{ label: help.label, parameters: help.parameters.map((p) => ({ label: p })) }],
      activeSignature: 0,
      activeParameter: help.activeParameter,
    }
  })

  connection.onReferences((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return []
    const offset = doc.offsetAt(params.position)
    return provider
      .references(doc.uri, doc.getText(), offset, params.context.includeDeclaration)
      .map(toLocation)
      .filter((l): l is NonNullable<typeof l> => l !== null)
  })

  connection.languages.semanticTokens.on((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return { data: [] }
    const builder = new SemanticTokensBuilder()
    for (const t of provider.semanticTokens(doc.uri, doc.getText())) {
      const pos = doc.positionAt(t.start)
      builder.push(pos.line, pos.character, t.end - t.start, t.tokenType, 0)
    }
    return builder.build()
  })

  connection.onPrepareRename((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const r = provider.prepareRename(doc.uri, doc.getText(), doc.offsetAt(params.position))
    return r ? rangeOf(doc, r.start, r.end) : null
  })

  connection.onRenameRequest((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const edits = provider.rename(
      doc.uri,
      doc.getText(),
      doc.offsetAt(params.position),
      params.newName,
    )
    if (edits.length === 0) return null
    const changes: Record<string, { range: ReturnType<typeof rangeOf>; newText: string }[]> = {}
    for (const e of edits) {
      const target = documents.get(e.uri)
      if (!target) continue
      ;(changes[e.uri] ??= []).push({ range: rangeOf(target, e.start, e.end), newText: e.newText })
    }
    return { changes }
  })

  connection.onDocumentSymbol((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return []
    return provider.documentSymbols(doc.uri, doc.getText()).map((s) => ({
      name: s.name,
      kind: SYMBOL_KIND[s.kind],
      range: { start: doc.positionAt(s.start), end: doc.positionAt(s.end) },
      selectionRange: {
        start: doc.positionAt(s.selectionStart),
        end: doc.positionAt(s.selectionEnd),
      },
    }))
  })

  connection.onHover((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const contents = provider.hover(doc.uri, doc.getText(), doc.offsetAt(params.position))
    if (contents === null) return null
    return { contents: { kind: MarkupKind.Markdown, value: contents } }
  })

  connection.onDefinition((params) => {
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return null
    const loc = provider.definition(doc.uri, doc.getText(), doc.offsetAt(params.position))
    if (!loc) return null
    // Convert the engine's offset range to a line/column range against the target
    // file — an open document, else a non-open file the provider can resolve
    // (e.g. a sysroot header), else one of the host-supplied sysroot files.
    const targetText =
      documents.get(loc.uri)?.getText() ??
      provider.resolveText?.(loc.uri) ??
      sysrootFiles.find((f) => f.path === loc.uri)?.text
    if (targetText === undefined) return null
    const td = TextDocument.create(loc.uri, provider.languageId, 0, targetText)
    return {
      uri: loc.uri,
      range: { start: td.positionAt(loc.start), end: td.positionAt(loc.end) },
    }
  })

  if (provider.buildOutputNotification && provider.parseBuildOutput) {
    const parse = provider.parseBuildOutput.bind(provider)
    connection.onNotification(provider.buildOutputNotification, (params: BuildOutputParams) => {
      const prev = new Set(buildDiags.keys())
      buildDiags.clear()
      for (const d of parse(params.output)) {
        const uri = resolveUri(d.file)
        const list = buildDiags.get(uri) ?? []
        list.push(buildDiagnostic(d, uri))
        buildDiags.set(uri, list)
      }
      for (const uri of new Set<string>([...prev, ...buildDiags.keys()])) publish(uri)
    })
  }

  documents.listen(connection)
  connection.listen()
}
