// Web Worker hosting the cc65 C language server. The engine + protocol are the
// in-repo @madside/lsp-* packages (lsp-cc65 = lsp-c under the cc65 dialect, on
// the lsp-core framework). The browser entry wires the server to this worker's
// message port; the main thread talks to it over JSON-RPC (see client.ts).
import '@madside/lsp-cc65/browser'
