import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser'
import { startServer } from '@madside/lsp-core'
import { createAsmProvider } from './provider'
import { getAsmDialect, madsDialect } from './dialects'

// Web Worker entry. One worker module serves every assembler; the host picks the
// dialect by spawning the worker with its id as the worker name —
// `new Worker(url, { type: 'module', name: 'z80asm' })`. `self.name` reads it
// back here (defaults to mads). Pair with the CodeMirror LSP client.
const worker = self as unknown as Worker
// `self.name` is the worker name the host set (WorkerGlobalScope.name), not on
// the Worker DOM type — read it via a structural cast.
const dialectId = (self as unknown as { name?: string }).name ?? ''
const dialect = getAsmDialect(dialectId) ?? madsDialect
startServer(
  createConnection(new BrowserMessageReader(worker), new BrowserMessageWriter(worker)),
  createAsmProvider(dialect),
)
