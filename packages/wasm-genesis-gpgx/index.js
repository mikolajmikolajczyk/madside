// Genesis Plus GX (full Sega Mega Drive: VDP + YM2612/PSG + Z80 + I/O) + the
// madside frontend harness, compiled to a wasm32 reactor (#145, Phase B). The
// emulator backend instantiates this and drives its exported API (init /
// rom_ptr / load_rom_buffer / run_frame / framebuffer / fb_* / get_reg /
// read_byte / audio_ptr / audio_update / set_input).
//
// Non-commercial core, used as an aggregated artifact (separate program over a
// wasm API boundary) + disclosed — see build/third-party.toml [source.genesis-plus-gx]
// and wiki/agents/genesis-gpgx-wasm-build.md.
export const gpgxWasmUrl = new URL('./genesis-gpgx.wasm', import.meta.url).href
