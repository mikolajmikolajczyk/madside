// Web Worker hosting the in-repo assembly language server (@madside/lsp-asm).
// One worker module serves every assembler; the browser entry reads the dialect
// id from `self.name` (set by the host via `new Worker(url, { name })`) and runs
// the matching dialect profile (mads / ca65 / z80asm) on the lsp-core framework.
// The main thread talks to it over JSON-RPC (see asm-client.ts).
import '@madside/lsp-asm/browser'
