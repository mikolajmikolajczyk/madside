// z88dk toolchain (asm path: z80asm + appmake; C path: zcc driver + zcpp/ucpp,
// zpragma, sccz80, copt), compiled to wasm.
export const z80asmWasmUrl = new URL('./z80asm.wasm', import.meta.url).href
export const appmakeWasmUrl = new URL('./appmake.wasm', import.meta.url).href
export const coptWasmUrl = new URL('./copt.wasm', import.meta.url).href
export const sccz80WasmUrl = new URL('./sccz80.wasm', import.meta.url).href
export const zccWasmUrl = new URL('./zcc.wasm', import.meta.url).href
export const zcppWasmUrl = new URL('./zcpp.wasm', import.meta.url).href
export const zpragmaWasmUrl = new URL('./zpragma.wasm', import.meta.url).href
