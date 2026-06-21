// chips-based cores (Emscripten MODULARIZE + EXPORT_ES6): the C64 and ZX
// Spectrum machine cores. Re-export each factory plus the URL of its wasm so
// the backend can pass `locateFile: () => <url>` and keep the wasm a static
// asset Vite emits.
export { default as createC64Core } from './c64-core.js'
export { default as createZxCore } from './zx-core.js'
export const c64WasmUrl = new URL('./c64-core.wasm', import.meta.url).href
export const zxWasmUrl = new URL('./zx-core.wasm', import.meta.url).href
