// Web Worker hosting the cc65-intel LSP server (the engine + LSP live in the
// sibling cc65-intel repo, MIT; linked via a Vite alias until published). The
// browser entry wires the server to this worker's message port; the main thread
// talks to it over JSON-RPC (see client.ts).
import '@cc65-intel/lsp/browser'
