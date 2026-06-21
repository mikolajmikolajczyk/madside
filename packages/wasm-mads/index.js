// MADS assembler, compiled to wasm. The URL is resolved against this module so
// Vite emits the blob as an asset and bundlers/node both get a fetchable href.
export const madsWasmUrl = new URL('./mads.wasm', import.meta.url).href
