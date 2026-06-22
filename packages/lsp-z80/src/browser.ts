import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser'
import { startServer } from '@madside/lsp-core'
import { createCProvider } from '@madside/lsp-c'
import { z80Dialect } from './dialect'

// Web Worker entry: the host runs this module as a worker; the z88dk C language
// server speaks JSON-RPC over the worker's message port. Pair with the
// CodeMirror LSP client on the main thread. `self` is the worker global; cast to
// Worker (an accepted port type) so this compiles under the DOM lib without the
// WebWorker lib (which clashes with DOM).
const worker = self as unknown as Worker
startServer(
  createConnection(new BrowserMessageReader(worker), new BrowserMessageWriter(worker)),
  createCProvider(z80Dialect),
)
