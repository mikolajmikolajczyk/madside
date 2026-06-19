// Thin LSP client: drives the cc65-intel server running in a Web Worker and
// exposes it as a CodeMirror completion source. Worker-native transport
// (vscode-jsonrpc over the worker message port) — no WebSocket, no heavy LSP
// client library. The engine/protocol live in @cc65-intel/*; this is just the
// host adapter (CodeMirror ↔ LSP), so the editor-specific concern (the trigger,
// the completion shape) stays here, out of the engine.

import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  type MessageConnection,
} from 'vscode-jsonrpc/browser'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Text } from '@codemirror/state'

// One virtual document for the active C editor. Single-editor scope for now;
// multi-document routing is a follow-up.
const DOC_URI = 'file:///active.c'

// LSP CompletionItemKind → CodeMirror completion `type`. (Field 5, Function 3,
// Constant 21, Variable 6, Struct 22.)
const CM_TYPE: Record<number, string> = {
  3: 'function',
  5: 'property',
  6: 'variable',
  21: 'constant',
  22: 'type',
}

interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
}

interface Position {
  line: number
  character: number
}

let connection: MessageConnection | null = null
let ready: Promise<void> | null = null
let opened = false
let version = 0

function connect(): { conn: MessageConnection; ready: Promise<void> } {
  if (connection && ready) return { conn: connection, ready }
  const worker = new Worker(new URL('./cc65-lsp.worker.ts', import.meta.url), { type: 'module' })
  const conn = createMessageConnection(
    new BrowserMessageReader(worker),
    new BrowserMessageWriter(worker),
  )
  conn.listen()
  connection = conn
  ready = (async () => {
    await conn.sendRequest('initialize', {
      processId: null,
      rootUri: null,
      capabilities: {},
      initializationOptions: {},
    })
    conn.sendNotification('initialized', {})
  })()
  return { conn, ready }
}

function positionOf(doc: Text, offset: number): Position {
  const line = doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

function syncDocument(conn: MessageConnection, text: string): void {
  if (opened) {
    conn.sendNotification('textDocument/didChange', {
      textDocument: { uri: DOC_URI, version: ++version },
      contentChanges: [{ text }],
    })
  } else {
    conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri: DOC_URI, languageId: 'c', version: ++version, text },
    })
    opened = true
  }
}

/** CodeMirror completion source backed by the cc65-intel LSP. */
export async function cc65LspComplete(ctx: CompletionContext): Promise<CompletionResult | null> {
  const { conn, ready: handshake } = connect()
  await handshake

  syncDocument(conn, ctx.state.doc.toString())

  const result = await conn.sendRequest<
    LspCompletionItem[] | { items: LspCompletionItem[] } | null
  >('textDocument/completion', {
    textDocument: { uri: DOC_URI },
    position: positionOf(ctx.state.doc, ctx.pos),
  })
  const items = Array.isArray(result) ? result : (result?.items ?? [])
  if (items.length === 0) return null

  const word = ctx.matchBefore(/\w*$/)
  const options: Completion[] = items.map((it) => ({
    label: it.label,
    detail: it.detail,
    type: it.kind !== undefined ? CM_TYPE[it.kind] : undefined,
  }))
  return { from: word ? word.from : ctx.pos, options, validFor: /^\w*$/ }
}
