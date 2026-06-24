// Thin LSP client for the in-repo assembly language server (@madside/lsp-asm),
// running in a Web Worker. Worker-native transport (vscode-jsonrpc over the
// message port), mirroring the C client (./client). One worker module serves
// every assembler; the active dialect (mads / ca65 / z80asm) is chosen by
// spawning the worker with the dialect id as its `name`, so switching dialect
// respawns it. Exposes the server as CodeMirror completion + hover sources;
// go-to-definition / references / rename / semantic tokens layer on later.

import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  type MessageConnection,
} from 'vscode-jsonrpc/browser'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { hoverTooltip, type Tooltip } from '@codemirror/view'
import type { Text } from '@codemirror/state'
import type { DefinitionTarget, ReferenceLocation, RenameChanges, RenameTextEdit } from './client'
import { setLspDiagnostics } from './diagnosticsStore'

const FILE_URI_PREFIX = 'file:///'

const pathForUri = (uri: string): string | null =>
  uri.startsWith(FILE_URI_PREFIX) ? uri.slice(FILE_URI_PREFIX.length) : null

const uriFor = (path: string): string => 'file:///' + path.replace(/^\/+/, '')

interface Position { line: number; character: number }
interface LspCompletionItem { label: string; kind?: number; detail?: string }
interface LspHover { contents?: string | { value?: string } }
interface LspLocation { uri: string; range: { start: Position; end: Position } }

// LSP CompletionItemKind → CodeMirror completion `type`. The asm provider emits
// keyword (opcode/directive), constant (equate), function (macro), variable
// (label). (Keyword 14, Function 3, Constant 21, Variable 6.)
const CM_TYPE: Record<number, string> = { 3: 'function', 6: 'variable', 14: 'keyword', 21: 'constant' }

// Active dialect id (worker name). Switching respawns the worker bound to the
// other dialect. Set by the editor before the lazy connect().
let dialectId = 'mads'
let worker: Worker | null = null
let connection: MessageConnection | null = null
let ready: Promise<void> | null = null
let activePath: string | null = null

interface DocEntry { uri: string; version: number; text: string }
const docs = new Map<string, DocEntry>()

/** Select the assembler dialect the worker hosts. Respawns if it changed. */
export function setAsmDialect(id: string): void {
  if (id === dialectId) return
  dialectId = id
  if (connection) {
    worker?.terminate()
    worker = null
    connection.dispose()
    connection = null
    ready = null
    docs.clear()
  }
}

/** Mark the focused buffer — completion/hover address this doc's URI. */
export function setAsmActiveDoc(path: string): void {
  activePath = path
}

function connect(): { conn: MessageConnection; ready: Promise<void> } {
  if (connection && ready) return { conn: connection, ready }
  // Static URL literal so Vite bundles the worker as its own chunk; the dialect
  // id rides the worker `name` (read by @madside/lsp-asm/browser via self.name).
  worker = new Worker(new URL('./asm-lsp.worker.ts', import.meta.url), { type: 'module', name: dialectId })
  const conn = createMessageConnection(new BrowserMessageReader(worker), new BrowserMessageWriter(worker))
  // The server publishes analysis diagnostics (undefined symbol / duplicate
  // definition) on every edit. Map each to a BuildDiagnostic against the project
  // path and stash them in the shared store the editor merges (#77). Registered
  // before listen() so no early push is missed.
  conn.onNotification(
    'textDocument/publishDiagnostics',
    (p: { uri: string; diagnostics: { range: { start: Position }; severity?: number; message: string }[] }) => {
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
    await conn.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} })
    conn.sendNotification('initialized', {})
  })()
  return { conn, ready }
}

function positionOf(doc: Text, offset: number): Position {
  const line = doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

/** Open `path` if unseen, else didChange when its text moved; returns the URI. */
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
    textDocument: { uri, languageId: 'asm', version: 1, text },
  })
  return uri
}

/** Sync the project's full source set so cross-file label resolution sees every
 *  file, not just the focused buffer. Idempotent. */
export async function syncAsmDocs(files: { path: string; text: string }[]): Promise<void> {
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

/** CodeMirror completion source backed by the asm language server: CPU opcodes
 *  (with descriptions), assembler directives, and project labels / equates /
 *  macros. Transport failure degrades to "no completions". */
export async function asmLspComplete(ctx: CompletionContext): Promise<CompletionResult | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, ctx.state.doc.toString())
    const result = await conn.sendRequest<LspCompletionItem[] | { items: LspCompletionItem[] } | null>(
      'textDocument/completion',
      { textDocument: { uri }, position: positionOf(ctx.state.doc, ctx.pos) },
    )
    const items = Array.isArray(result) ? result : (result?.items ?? [])
    if (items.length === 0) return null
    const word = ctx.matchBefore(/[\w.@?]*$/)
    if (!ctx.explicit && (!word || word.from === word.to)) return null
    const options: Completion[] = items.map((it) => ({
      label: it.label,
      detail: it.detail,
      type: it.kind !== undefined ? CM_TYPE[it.kind] : undefined,
    }))
    return { from: word ? word.from : ctx.pos, options, validFor: /^[\w.@?]*$/ }
  } catch {
    return null
  }
}

/** Render the asm hover markdown (a bold head line, a flags line, an addressing-
 *  modes bullet list) into a tooltip DOM without a markdown renderer. */
function renderAsmHover(markdown: string): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-asm-hover'
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (!line) continue
    const el = document.createElement('div')
    const bold = line.startsWith('**')
    el.textContent = line.replace(/[*`]/g, '').replace(/^- /, '  • ')
    if (bold) el.style.fontWeight = '600'
    else if (line.startsWith('- ') || line.startsWith('Flags')) el.style.opacity = '0.8'
    dom.appendChild(el)
  }
  return dom
}

/** CodeMirror hover source backed by the asm language server: opcode docs +
 *  addressing modes, or a symbol's kind + value + definition site. */
export const asmLspHover = hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
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
    return { pos, create: () => ({ dom: renderAsmHover(value) }) }
  } catch {
    return null
  }
})

// All asm sources are editable project files — every result URI carries the
// file:/// prefix and maps to a navigable project path (no read-only sysroot).
const targetOf = (loc: LspLocation): DefinitionTarget => ({
  path: loc.uri.startsWith(FILE_URI_PREFIX) ? loc.uri.slice(FILE_URI_PREFIX.length) : loc.uri,
  line: loc.range.start.line + 1,
  sysroot: false,
})

/** Resolve the definition for the label/symbol at `pos` (cross-file). Null on
 *  miss / transport failure. */
export async function asmDefinition(doc: Text, pos: number): Promise<DefinitionTarget | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())
    const res = await conn.sendRequest<LspLocation | LspLocation[] | null>('textDocument/definition', {
      textDocument: { uri },
      position: positionOf(doc, pos),
    })
    const loc = Array.isArray(res) ? res[0] : res
    return loc ? targetOf(loc) : null
  } catch {
    return null
  }
}

/** All references to the symbol at `pos` (declaration included), across every
 *  open source. Empty on miss / transport failure. */
export async function asmReferences(doc: Text, pos: number): Promise<ReferenceLocation[]> {
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
    return (res ?? []).map((loc) => ({ path: targetOf(loc).path, line: loc.range.start.line + 1, sysroot: false }))
  } catch {
    return []
  }
}

/** offset → LSP position against a plain string (rename hands us the buffer text
 *  + a cursor offset, not a CodeMirror doc). */
function positionOfText(text: string, offset: number): Position {
  let line = 0
  let lineStart = 0
  const end = Math.min(offset, text.length)
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1 }
  }
  return { line, character: offset - lineStart }
}

/** Rename the symbol at `pos` (offset in `text`) to `newName`, returning edits
 *  per project path. Null when not renameable / on failure. */
export async function asmRename(text: string, pos: number, newName: string): Promise<RenameChanges | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, text)
    const res = await conn.sendRequest<{ changes?: Record<string, RenameTextEdit[]> } | null>(
      'textDocument/rename',
      { textDocument: { uri }, position: positionOfText(text, pos), newName },
    )
    if (!res?.changes) return null
    const out: RenameChanges = {}
    for (const [u, edits] of Object.entries(res.changes)) {
      if (u.startsWith(FILE_URI_PREFIX)) out[u.slice(FILE_URI_PREFIX.length)] = edits
    }
    return out
  } catch {
    return null
  }
}

/** Full-document semantic tokens for the focused buffer — the server's packed LSP
 *  array ([deltaLine, deltaStartChar, length, tokenType, tokenModifiers]); the
 *  host decodes it. Token-type order is the asm legend (SEM_LEGEND). Null on
 *  miss / transport failure. */
export async function asmSemanticTokensFull(doc: Text): Promise<number[] | null> {
  try {
    if (!activePath) return null
    const { conn, ready: handshake } = connect()
    await handshake
    const uri = openOrChange(conn, activePath, doc.toString())
    const res = await conn.sendRequest<{ data: number[] } | null>('textDocument/semanticTokens/full', {
      textDocument: { uri },
    })
    return res?.data ?? null
  } catch {
    return null
  }
}
