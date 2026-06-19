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
    const { conn, ready: handshake } = connect()
    await handshake
    syncDocument(conn, view.state.doc.toString())

    const res = await conn.sendRequest<LspHover | null>('textDocument/hover', {
      textDocument: { uri: DOC_URI },
      position: positionOf(view.state.doc, pos),
    })
    const value = typeof res?.contents === 'string' ? res.contents : res?.contents?.value
    if (!value) return null
    return { pos, create: () => ({ dom: renderHover(value) }) }
  } catch {
    return null
  }
})
