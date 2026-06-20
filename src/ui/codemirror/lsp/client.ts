// Thin LSP client: drives the cc65-intel server running in a Web Worker and
// exposes it as CodeMirror completion + hover sources. Worker-native transport
// (vscode-jsonrpc over the worker message port) — no WebSocket, no heavy LSP
// client library. The engine/protocol live in @cc65-intel/*; this is just the
// host adapter (CodeMirror ↔ LSP), so the editor-specific concerns (trigger,
// completion shape, applying auto-`#include` edits) stay here, out of the engine.

import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  type MessageConnection,
} from 'vscode-jsonrpc/browser'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { hoverTooltip, type EditorView, type Tooltip } from '@codemirror/view'
import type { Text } from '@codemirror/state'
import type { SourceFile } from '@cc65-intel/core'
import { setLspDiagnostics } from './diagnosticsStore'

// Project files open with the server under real `file://` URIs (#70) so the
// engine sees the whole translation unit set, not just the focused buffer —
// the prerequisite for cross-file navigation. `file:///<project-path>`; the
// server treats the URI opaquely, we only need it stable + unique per path.
const uriFor = (path: string): string => 'file:///' + path.replace(/^\/+/, '')

// Reverse of `uriFor`: a project doc URI carries the `file:///` prefix → strip
// it back to the project path; a sysroot-header URI is a bare path (no prefix)
// and has no editable project file, so it maps to null.
const pathForUri = (uri: string): string | null =>
  uri.startsWith('file:///') ? uri.slice('file:///'.length) : null

interface LspDiagnostic {
  range: { start: Position; end: Position }
  severity?: number
  message: string
}

// LSP CompletionItemKind → CodeMirror completion `type`. (Field 5, Function 3,
// Constant 21, Variable 6, Struct 22.)
const CM_TYPE: Record<number, string> = {
  3: 'function',
  5: 'property',
  6: 'variable',
  21: 'constant',
  22: 'type',
}

interface Position {
  line: number
  character: number
}
interface LspTextEdit {
  range: { start: Position; end: Position }
  newText: string
}
interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  additionalTextEdits?: LspTextEdit[]
}
interface LspHover {
  contents?: string | { value?: string }
}

// cc65 sysroot headers the server indexes for stdlib completion + register
// structs + auto-`#include`. Set by the editor (from the active machine's
// target) before the first request, so the lazy `connect()` sends them at
// `initialize`.
let sysrootHeaders: SourceFile[] = []
export function setSysrootHeaders(headers: SourceFile[]): void {
  sysrootHeaders = headers
}

let connection: MessageConnection | null = null
let ready: Promise<void> | null = null

// Open-document registry: project path → { uri, version, last-synced text }.
// One entry per open `.c`/`.h`, kept in sync via didOpen/didChange/didClose.
// `text` lets us skip a no-op didChange when the bytes are unchanged.
interface DocEntry {
  uri: string
  version: number
  text: string
}
const docs = new Map<string, DocEntry>()

// The focused editor's path — completion/hover target this doc's URI. Set by
// the editor (loadLanguagePack) when a C file becomes active.
let activePath: string | null = null
export function setActiveDoc(path: string): void {
  activePath = path
}

function connect(): { conn: MessageConnection; ready: Promise<void> } {
  if (connection && ready) return { conn: connection, ready }
  const worker = new Worker(new URL('./cc65-lsp.worker.ts', import.meta.url), { type: 'module' })
  const conn = createMessageConnection(
    new BrowserMessageReader(worker),
    new BrowserMessageWriter(worker),
  )
  // The server pushes semantic diagnostics on every edit (#77). Map each to a
  // BuildDiagnostic against the project path and stash them for the app to
  // merge with its build diagnostics. Registered before listen() so no early
  // push is missed. Sysroot-header URIs (no project path) are ignored.
  conn.onNotification(
    'textDocument/publishDiagnostics',
    (p: { uri: string; diagnostics: LspDiagnostic[] }) => {
      const path = pathForUri(p.uri)
      if (!path) return
      setLspDiagnostics(
        path,
        p.diagnostics.map((d) => ({
          file: path,
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          severity: (d.severity ?? 1) === 1 ? 'error' : 'warning',
          message: d.message,
        })),
      )
    },
  )
  conn.listen()
  connection = conn
  ready = (async () => {
    await conn.sendRequest('initialize', {
      processId: null,
      rootUri: null,
      capabilities: {},
      initializationOptions: { sysrootHeaders },
    })
    conn.sendNotification('initialized', {})
  })()
  return { conn, ready }
}

function positionOf(doc: Text, offset: number): Position {
  const line = doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

function offsetOf(doc: Text, pos: Position): number {
  return doc.line(pos.line + 1).from + pos.character
}

/** Open `path` if unseen, else didChange when its text moved. Returns the URI
 *  so callers (completion/hover) can address the request at the live doc. */
function openOrChange(conn: MessageConnection, path: string, text: string): string {
  const existing = docs.get(path)
  if (existing) {
    if (existing.text !== text) {
      existing.version++
      existing.text = text
      conn.sendNotification('textDocument/didChange', {
        textDocument: { uri: existing.uri, version: existing.version },
        contentChanges: [{ text }],
      })
    }
    return existing.uri
  }
  const uri = uriFor(path)
  docs.set(path, { uri, version: 1, text })
  conn.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'c', version: 1, text },
  })
  return uri
}

/** Sync the project's full `.c`/`.h` set with the server: open new files,
 *  didChange edited ones, didClose removed ones. Driven from the app (which
 *  holds every file) so cross-file resolution sees the whole project, not just
 *  the focused buffer. Idempotent — unchanged files send nothing. */
export async function syncProjectDocs(files: { path: string; text: string }[]): Promise<void> {
  const { conn, ready: handshake } = connect()
  await handshake
  const incoming = new Set(files.map((f) => f.path))
  for (const [path, entry] of docs) {
    if (!incoming.has(path)) {
      conn.sendNotification('textDocument/didClose', { textDocument: { uri: entry.uri } })
      docs.delete(path)
    }
  }
  for (const f of files) openOrChange(conn, f.path, f.text)
}

/** Apply the completion's label plus any LSP `additionalTextEdits` (auto-
 *  `#include`) in one dispatch. All edits are in original-document coordinates;
 *  CodeMirror composes them. */
function applyWithEdits(label: string, edits: LspTextEdit[]) {
  return (view: EditorView, _completion: Completion, from: number, to: number): void => {
    const doc = view.state.doc
    view.dispatch({
      changes: [
        { from, to, insert: label },
        ...edits.map((e) => ({
          from: offsetOf(doc, e.range.start),
          to: offsetOf(doc, e.range.end),
          insert: e.newText,
        })),
      ],
    })
  }
}

/** CodeMirror completion source backed by the cc65-intel LSP. Any transport
 *  failure (worker crash, init error) degrades to "no completions" rather than
 *  surfacing an error in the editor. */
export async function cc65LspComplete(ctx: CompletionContext): Promise<CompletionResult | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    // Push the focused buffer's freshest text (may be ahead of the project
    // sync, which lands a render later) and address the request at its URI.
    const uri = openOrChange(conn, activePath, ctx.state.doc.toString())

    const result = await conn.sendRequest<
      LspCompletionItem[] | { items: LspCompletionItem[] } | null
    >('textDocument/completion', {
      textDocument: { uri },
      position: positionOf(ctx.state.doc, ctx.pos),
    })
    const items = Array.isArray(result) ? result : (result?.items ?? [])
    if (items.length === 0) return null

    const word = ctx.matchBefore(/\w*$/)
    const options: Completion[] = items.map((it) => ({
      label: it.label,
      detail: it.detail,
      type: it.kind !== undefined ? CM_TYPE[it.kind] : undefined,
      ...(it.additionalTextEdits?.length
        ? { apply: applyWithEdits(it.label, it.additionalTextEdits) }
        : {}),
    }))
    return { from: word ? word.from : ctx.pos, options, validFor: /^\w*$/ }
  } catch {
    return null
  }
}

/** Render the engine's hover markdown (a ```c …``` code block + a meta line)
 *  into a tooltip DOM: the signature monospaced, the rest dimmed. Keeps it
 *  dependency-free — no markdown renderer in a CodeMirror tooltip. */
function renderHover(markdown: string): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-cc65-hover'
  const code = /```c?\n([\s\S]*?)\n```/.exec(markdown)
  if (code) {
    const pre = document.createElement('pre')
    pre.style.margin = '0'
    pre.textContent = code[1] ?? ''
    dom.appendChild(pre)
    const meta = markdown.replace(code[0], '').replace(/[*`<>]/g, '').trim()
    if (meta) {
      const el = document.createElement('div')
      el.style.opacity = '0.7'
      el.style.marginTop = '2px'
      el.textContent = meta
      dom.appendChild(el)
    }
  } else {
    dom.textContent = markdown.replace(/[*`]/g, '')
  }
  return dom
}

/** CodeMirror hover source backed by the cc65-intel LSP. Transport failures
 *  degrade to "no tooltip". */
export const cc65LspHover = hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, view.state.doc.toString())

    const res = await conn.sendRequest<LspHover | null>('textDocument/hover', {
      textDocument: { uri },
      position: positionOf(view.state.doc, pos),
    })
    const value = typeof res?.contents === 'string' ? res.contents : res?.contents?.value
    if (!value) return null
    return { pos, create: () => ({ dom: renderHover(value) }) }
  } catch {
    return null
  }
})

interface LspLocation {
  uri: string
  range: { start: Position; end: Position }
}

/** Where a go-to-definition lands, mapped back to host terms (#73). A project
 *  file (`sysroot: false`) opens in the editor; a sysroot header opens in the
 *  read-only system viewer. `line` is 1-based to match the editor's goto. */
export interface DefinitionTarget {
  path: string
  line: number
  sysroot: boolean
}

// Reverse of `uriFor`: a project doc URI carries the `file:///` prefix; a
// sysroot header comes back as its bare header path (`include/c64.h`).
const FILE_URI_PREFIX = 'file:///'

/** Resolve the definition for the symbol at `pos` in the focused buffer, mapped
 *  to a host navigation target. Cross-file: the server resolves against every
 *  open project doc (#70) plus the sysroot headers. Null on miss or transport
 *  failure (degrades to "no navigation"). */
export async function cc65LspDefinition(doc: Text, pos: number): Promise<DefinitionTarget | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())

    const res = await conn.sendRequest<LspLocation | LspLocation[] | null>(
      'textDocument/definition',
      { textDocument: { uri }, position: positionOf(doc, pos) },
    )
    const loc = Array.isArray(res) ? res[0] : res
    if (!loc) return null
    const sysroot = !loc.uri.startsWith(FILE_URI_PREFIX)
    const path = sysroot ? loc.uri : loc.uri.slice(FILE_URI_PREFIX.length)
    return { path, line: loc.range.start.line + 1, sysroot }
  } catch {
    return null
  }
}

/** Full-document semantic tokens for the focused buffer (#72). Returns the
 *  server's packed LSP array (`[deltaLine, deltaStartChar, length, tokenType,
 *  tokenModifiers]` quintuples) — the host decodes it into editor decorations.
 *  The token-type order is the server's legend: type, function, macro,
 *  parameter, property, variable. Null on miss / transport failure. */
export async function cc65SemanticTokensFull(doc: Text): Promise<number[] | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())

    const res = await conn.sendRequest<{ data: number[] } | null>(
      'textDocument/semanticTokens/full',
      { textDocument: { uri } },
    )
    return res?.data ?? null
  } catch {
    return null
  }
}

interface LspSignatureHelp {
  signatures?: { label: string; parameters?: { label: string }[] }[]
  activeSignature?: number
  activeParameter?: number
}

/** A resolved signature for the call the cursor sits inside (#71): the full
 *  signature text + its parameter labels + which one is active. */
export interface SignatureInfo {
  label: string
  params: string[]
  active: number
}

/** Signature help for the call enclosing `pos`, or null when the cursor isn't
 *  inside a known call (the server decides). Transport failures degrade to
 *  null (no popup). */
export async function cc65SignatureHelp(doc: Text, pos: number): Promise<SignatureInfo | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())

    const res = await conn.sendRequest<LspSignatureHelp | null>('textDocument/signatureHelp', {
      textDocument: { uri },
      position: positionOf(doc, pos),
    })
    const sig = res?.signatures?.[res.activeSignature ?? 0]
    if (!sig) return null
    return {
      label: sig.label,
      params: (sig.parameters ?? []).map((p) => p.label),
      active: res?.activeParameter ?? 0,
    }
  } catch {
    return null
  }
}

interface LspDocumentSymbol {
  name: string
  kind: number
  range: { start: Position; end: Position }
}

/** One top-level declaration in the active C file (#76). `kind` is the LSP
 *  SymbolKind; `line` is 1-based for the editor's goto. */
export interface OutlineItem {
  name: string
  kind: number
  line: number
}

/** Document symbols (functions / structs / typedefs / globals) for `path`. Syncs
 *  the passed text first so the outline tracks unsaved edits. Empty on miss /
 *  transport failure. */
export async function cc65DocumentSymbols(path: string, text: string): Promise<OutlineItem[]> {
  try {
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, path, text)

    const res = await conn.sendRequest<LspDocumentSymbol[] | null>('textDocument/documentSymbol', {
      textDocument: { uri },
    })
    return (res ?? []).map((s) => ({ name: s.name, kind: s.kind, line: s.range.start.line + 1 }))
  } catch {
    return []
  }
}

/** One reference site (#74). `path` is a project path (`sysroot: false`,
 *  navigable in the editor) or a bare sysroot-header path; `line` is 1-based. */
export interface ReferenceLocation {
  path: string
  line: number
  sysroot: boolean
}

/** All references to the symbol at `pos`, declaration included, across every
 *  open project document. Empty on miss / transport failure. */
export async function cc65References(doc: Text, pos: number): Promise<ReferenceLocation[]> {
  try {
    if (!activePath) return []
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())

    const res = await conn.sendRequest<LspLocation[] | null>('textDocument/references', {
      textDocument: { uri },
      position: positionOf(doc, pos),
      context: { includeDeclaration: true },
    })
    return (res ?? []).map((loc) => {
      const sysroot = !loc.uri.startsWith(FILE_URI_PREFIX)
      return {
        path: sysroot ? loc.uri : loc.uri.slice(FILE_URI_PREFIX.length),
        line: loc.range.start.line + 1,
        sysroot,
      }
    })
  } catch {
    return []
  }
}
