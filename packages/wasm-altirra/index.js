// Altirra Atari 8-bit core (Emscripten MODULARIZE + EXPORT_ES6). Re-export the
// factory plus its wasm URL for `locateFile: () => altirraWasmUrl`.
export { default as createAltirraCore } from './altirra-core.js'
export const altirraWasmUrl = new URL('./altirra-core.wasm', import.meta.url).href
