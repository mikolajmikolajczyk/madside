// Minimal WASI runner for the cc65 spike. Maps `/` to a work dir (WASI_DIR env,
// default /tmp/ca65work) so the tools read/write files there. Usage:
//   WASI_DIR=/path node wasi-run.mjs tool.wasm <args...>
import { WASI } from 'node:wasi';
import { argv, env } from 'node:process';
import { readFile } from 'node:fs/promises';
const wasmPath = argv[2];
const toolArgs = argv.slice(3);
const workDir = env.WASI_DIR ?? '/tmp/ca65work';
const wasi = new WASI({ version: 'preview1', args: [wasmPath, ...toolArgs], env, preopens: { '/': workDir } });
const bytes = await readFile(wasmPath);
const mod = await WebAssembly.compile(bytes);
const inst = await WebAssembly.instantiate(mod, wasi.getImportObject());
try { const code = wasi.start(inst); console.log('[exit]', code ?? 0); }
catch(e){ console.log('[threw]', e.message); }
