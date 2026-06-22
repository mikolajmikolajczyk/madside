// Web Worker hosting the z88dk/sccz80 (Z80) C language server. The engine +
// protocol are the in-repo @madside/lsp-* packages (lsp-z80 = lsp-c under the
// z88dk dialect, on the lsp-core framework). The browser entry wires the server
// to this worker's message port; the main thread talks to it over JSON-RPC (see
// client.ts).
import '@madside/lsp-z80/browser'
