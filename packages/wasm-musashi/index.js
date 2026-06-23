// Musashi 68000 core + Genesis system harness, compiled to a wasm32 reactor
// (#145). The emulator backend instantiates this and drives its exported API
// (init / load_rom / reset / run_cycles / get_reg / read_byte / rom_ptr / ram_ptr).
export const musashiWasmUrl = new URL('./musashi.wasm', import.meta.url).href
