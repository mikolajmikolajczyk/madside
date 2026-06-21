// cc65 C compiler + ca65 assembler + ld65 linker, compiled to wasm.
export const ca65WasmUrl = new URL('./ca65.wasm', import.meta.url).href
export const cc65WasmUrl = new URL('./cc65.wasm', import.meta.url).href
export const ld65WasmUrl = new URL('./ld65.wasm', import.meta.url).href
