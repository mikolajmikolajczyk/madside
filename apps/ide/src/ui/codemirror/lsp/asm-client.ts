// Thin LSP client for the in-repo assembly language server (@madside/lsp-asm),
// running in Web Workers. Worker-native transport (vscode-jsonrpc over the
// message port), mirroring the C client (./client).
//
// One worker PER DIALECT (#148): a project can mix dialects (Genesis pairs M68k
// `.asm` with a z80 `.s80` driver), so we keep a live worker for each dialect in
// play and route a file to its dialect's worker — no terminate/respawn thrash on
// tab switch, no wrong-dialect analysis. The dialect id rides the worker `name`
// (read by @madside/lsp-asm/browser via self.name). Each worker holds its own
// files; diagnostics for a shared include come from its single `owner` dialect
// (others suppressed) so squiggles never conflict.

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

// LSP CompletionItemKind → CodeMirror completion `type`. (Keyword 14, Function 3,
// Constant 21, Variable 6.)
const CM_TYPE: Record<number, string> = { 3: 'function', 6: 'variable', 14: 'keyword', 21: 'constant' }

interface DocEntry { uri: string; version: number; text: string }
interface Client {
  worker: Worker
  conn: MessageConnection
  ready: Promise<void>
  docs: Map<string, DocEntry>
  /** Paths this dialect owns diagnostics for — a file is owned by exactly one
   *  dialect, so the others' publishes for it are dropped (no conflict). */
  owned: Set<string>
}

const clients = new Map<string, Client>()
// The focused buffer + its dialect; completion/hover/etc address this doc's URI
// on its dialect's worker.
let activePath: string | null = null
let activeDialect: string | null = null

/** Mark the focused buffer + its dialect — requests route to that worker. */
export function setAsmActiveDoc(path: string, dialect: string): void {
  activePath = path
  activeDialect = dialect
}

/** Lazily spawn + handshake the worker for a dialect. Reused across edits. */
function clientFor(dialect: string): Client {
  const existing = clients.get(dialect)
  if (existing) return existing
  // Static URL literal so Vite bundles the worker as its own chunk; the dialect
  // id rides the worker `name` (read by @madside/lsp-asm/browser via self.name).
  const worker = new Worker(new URL('./asm-lsp.worker.ts', import.meta.url), { type: 'module', name: dialect })
  const conn = createMessageConnection(new BrowserMessageReader(worker), new BrowserMessageWriter(worker))
  const client: Client = { worker, conn, ready: Promise.resolve(), docs: new Map(), owned: new Set() }
  // The server publishes analysis diagnostics on every edit. Map each to a
  // BuildDiagnostic and stash in the shared store the editor merges (#77). Only
  // for paths this dialect OWNS, so a file synced to two workers (shared include)
  // doesn't get conflicting squiggles. Registered before listen() so no early
  // push is missed.
  conn.onNotification(
    'textDocument/publishDiagnostics',
    (p: { uri: string; diagnostics: { range: { start: Position }; severity?: number; message: string }[] }) => {
      const path = pathForUri(p.uri)
      if (!path || !client.owned.has(path)) return
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
  client.ready = (async () => {
    await conn.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} })
    conn.sendNotification('initialized', {})
  })()
  clients.set(dialect, client)
  return client
}

/** The client for the focused doc's dialect (lazily spawned), or null if no asm
 *  doc is active. */
function activeClient(): Client | null {
  return activeDialect ? clientFor(activeDialect) : null
}

function positionOf(doc: Text, offset: number): Position {
  const line = doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

/** Open `path` if unseen on this client, else didChange when its text moved;
 *  returns the URI. */
function openOrChange(client: Client, path: string, text: string): string {
  const existing = client.docs.get(path)
  if (existing) {
    if (existing.text !== text) {
      existing.version++
      existing.text = text
      client.conn.sendNotification('textDocument/didChange', {
        textDocument: { uri: existing.uri, version: existing.version },
        contentChanges: [{ text }],
      })
    }
    return existing.uri
  }
  const uri = uriFor(path)
  client.docs.set(path, { uri, version: 1, text })
  client.conn.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'asm', version: 1, text },
  })
  return uri
}

/** A dialect's file set: the sources to sync to its worker + the subset it owns
 *  diagnostics for. */
export interface AsmDialectDocs {
  dialect: string
  files: { path: string; text: string }[]
  owned: string[]
}

/** Sync the project's asm sources to their dialect workers (#148): cross-file
 *  resolution sees every same-dialect file, and a shared include lands in each
 *  dialect that uses it. A dialect with no files left is torn down. Idempotent. */
export async function syncAsmDocs(byDialect: AsmDialectDocs[]): Promise<void> {
  const wanted = new Set(byDialect.map((d) => d.dialect))
  // Tear down workers for dialects no longer present (project/toolchain change).
  for (const [dialect, client] of [...clients]) {
    if (wanted.has(dialect)) continue
    for (const [path] of client.docs) setLspDiagnostics(path, [])
    client.worker.terminate()
    client.conn.dispose()
    clients.delete(dialect)
  }
  await Promise.all(
    byDialect.map(async ({ dialect, files, owned }) => {
      const client = clientFor(dialect)
      await client.ready
      client.owned = new Set(owned)
      const incoming = new Set(files.map((f) => f.path))
      for (const [path, entry] of client.docs) {
        if (incoming.has(path)) continue
        client.conn.sendNotification('textDocument/didClose', { textDocument: { uri: entry.uri } })
        client.docs.delete(path)
        // Closing drops the doc from the worker; clear its diagnostics too (the
        // worker won't publish over them once closed).
        setLspDiagnostics(path, [])
      }
      for (const f of files) openOrChange(client, f.path, f.text)
    }),
  )
}

/** CodeMirror completion source backed by the asm language server: CPU opcodes
 *  (with descriptions), assembler directives, and project labels / equates /
 *  macros. Transport failure degrades to "no completions". */
export async function asmLspComplete(ctx: CompletionContext): Promise<CompletionResult | null> {
  try {
    const client = activeClient()
    if (!client || !activePath) return null
    await client.ready
    const uri = openOrChange(client, activePath, ctx.state.doc.toString())
    const result = await client.conn.sendRequest<LspCompletionItem[] | { items: LspCompletionItem[] } | null>(
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
    const client = activeClient()
    if (!client || !activePath) return null
    await client.ready
    const uri = openOrChange(client, activePath, view.state.doc.toString())
    const res = await client.conn.sendRequest<LspHover | null>('textDocument/hover', {
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
    const client = activeClient()
    if (!client || !activePath) return null
    await client.ready
    const uri = openOrChange(client, activePath, doc.toString())
    const res = await client.conn.sendRequest<LspLocation | LspLocation[] | null>('textDocument/definition', {
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
    const client = activeClient()
    if (!client || !activePath) return []
    await client.ready
    const uri = openOrChange(client, activePath, doc.toString())
    const res = await client.conn.sendRequest<LspLocation[] | null>('textDocument/references', {
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
    const client = activeClient()
    if (!client || !activePath) return null
    await client.ready
    const uri = openOrChange(client, activePath, text)
    const res = await client.conn.sendRequest<{ changes?: Record<string, RenameTextEdit[]> } | null>(
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
    const client = activeClient()
    if (!client || !activePath) return null
    await client.ready
    const uri = openOrChange(client, activePath, doc.toString())
    const res = await client.conn.sendRequest<{ data: number[] } | null>('textDocument/semanticTokens/full', {
      textDocument: { uri },
    })
    return res?.data ?? null
  } catch {
    return null
  }
}
