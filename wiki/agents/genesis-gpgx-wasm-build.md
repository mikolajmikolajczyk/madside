# Building `genesis-gpgx.wasm` (Phase B, #145) — PLAN / handoff

> **Status: not built yet.** This is the precise plan for the next session. The
> bare-Musashi backend (`emulator-genesis-musashi`) validated Phase A headless;
> gpgx is the full-system Phase-B backend (VDP + YM2612/PSG + Z80 + I/O).

## What + why

[Genesis Plus GX](https://github.com/ekeeke/Genesis-Plus-GX) (gpgx) — the full Sega
Mega Drive emulator. **It uses Musashi internally** (`core/m68k/`), so the existing
`@madside/debug-m68k` adapter + `Cpu68kState` work on its m68k context. Phase B =
swap the emulator backend; `toolchain-clownassembler`, `machine-genesis`,
`debug-m68k` all carry over.

## Licence (READ — non-commercial)

gpgx is **non-commercial** ("Redistributions may not be sold, nor used in a
commercial product"). Clashes with madside's AGPL, so handled like the other cores:
**aggregated** (a separate emulator-core wasm the app instantiates over an API
boundary — NOT linked into the AGPL code, same footing as chips/altirra) +
**disclosed** (`third-party.toml [source.genesis-plus-gx]` + a README/docs note).
madside's own code stays AGPL; the bundled core keeps its licence; **the assembled
IDE isn't commercially redistributable, but games users build are unaffected
(commercial-OK)** — the emulator contributes no code to a ROM. See [[licensing-stance]].

Pinned: `third-party.toml [source.genesis-plus-gx]`, ref `c7ecd07`.

## Build approach (wasi-sdk reactor, like Musashi)

- **wasi-sdk clang, `-mexec-model=reactor`** (exported fns, no `_start`) — same as
  `musashi.wasm`. NOT emscripten.
- **No host-gen step.** gpgx commits its m68k tables (`m68kops.h` 533K,
  `m68ki_instruction_jump_table.h` 1.2M, `m68ki_cycles.h`) — no m68kmake.
- **setjmp shim** — gpgx's Musashi uses setjmp/longjmp; wasi-sdk 33 has no SjLj
  runtime. Reuse `build/support/musashi/shim/setjmp.h` (or copy it).

## File set (base Genesis — EXCLUDE SegaCD)

Compile `core/*.c` + `core/{m68k,z80,ntsc,sound,sound/minimp3,input_hw,cart_hw,cart_hw/svp}/*.c`.
**Exclude `core/cd_hw/` + `libretro/.../libchdr` + zstd/lzma/zlib/tremor** (SegaCD —
not needed). **Risk:** `system.c`/`loadrom.c`/`state.c` reference cd_hw under
`system_hw == SYSTEM_MCD` branches → expect undefined symbols; either stub the few
`scd_*` calls or carry a tiny no-CD shim. Resolve at first link (iterate like the
parse1.c/z88dk grind). `core/debug/` is optional — skip unless needed.

## osd glue

The core expects `osd.h` (libretro provides one at `libretro/osd.h`). Write a
**minimal `osd.h`** in `build/support/genesis-gpgx/` providing the types/macros the
core uses (look at what `core/*.c` pulls from osd.h: logging macros → stub to no-op,
`osd_input_update`, render-bpp). Strip all libretro/SDL.

## Frontend wrapper (`genesis-gpgx-system.c`, reactor exports)

Mirror `musashi-system.c`. Exports:
- `init()` — `system_init()`, set `system_hw = SYSTEM_MD`, `config` defaults,
  `audio_init(44100, 60)`.
- `rom_ptr()` / `load_rom_buffer(len)` — write ROM into a buffer then load. **ROM
  load is file-based (`load_rom(char*)`)** but there's a buffer path: study
  `core/loadrom.c` `load_rom()` — replicate (memcpy → `cart.rom`, set `cart.romsize`,
  run the header/mapper detect + `system_reset()`) from a buffer instead of a file.
  (libretro keeps `g_rom_data` = `info->data` then calls `load_rom(path)` — find the
  buffer entry or factor one out.)
- `reset()` — `system_reset()`.
- `run_frame()` — `system_frame_gen(0)`.
- `framebuffer()` → `bitmap.data` ptr; `fb_width/fb_height/fb_pitch()` from
  `bitmap.width/height/pitch`. **Configure 32-bit output (xrgb8888)** to match
  `RunBackend.pixels: Uint32Array` — gpgx render bpp is config/compile-time (find it
  in `vdp_render.c` / `config.h`; default is RGB565 → set RGB888/XRGB).
- `get_reg(r)` — `m68k_get_reg((m68k_register_t)r)` (**1-arg in gpgx**, vs bare
  Musashi's 2-arg). Same enum (D0=0..A7=15, PC=16, SR=17).
- `read_byte(addr)` — read the 68000 bus (gpgx `mem68k.c`; expose a read or call the
  read handler).
- `audio_update(buf)` — `audio_update(int16*)` → stereo blip buffer.
- input: `set_input(pad, buttons)` → gpgx `input.pad[]` / `io_ctrl`.

## Debug step (the tricky bit)

gpgx is **frame-scheduled** (m68k interleaved with z80/vdp/io), not a bare
`m68k_execute(1)`. Single-instruction `step()` needs either Musashi's
`M68K_INSTRUCTION_HOOK` (enable in `core/m68k/m68kconf.h`, break after one) or a
minimal-cycle run. `advanceFrame` = `run_frame()`; `step` = one m68k instruction via
the hook. Breakpoints = the same hook checking PC. This is more involved than the
bare-Musashi backend — budget time.

## TS side

`packages/emulator-genesis-gpgx/` — `EmulatorPlugin` id `genesis-gpgx` + RunBackend
(reactor instantiate like `musashi-backend.ts`: stub wasi imports + `_initialize`;
read `bitmap.data` into `pixels` each frame). Add to `machine-genesis`
`compatibleEmulators` (gpgx primary; keep `genesis-musashi` as a headless fallback
or retire later). Reuses `debug-m68k` unchanged. `packages/wasm-genesis-gpgx/` for
the artifact + URL export.

## Smoke / verify

Assemble a Genesis ROM with clownassembler that sets a CRAM palette entry + writes a
tile, run N frames, assert `bitmap.data` is non-blank (or a known pixel). Extend the
`tests/integration/genesis-68k` chain to the gpgx backend.

## Build infra (to add)

`third-party.toml` pin ✅ (done). TODO: `build/support/genesis-gpgx/{osd.h,
genesis-gpgx-system.c, build-genesis-gpgx.sh}` + `build-genesis-gpgx-wasm` recipe in
`build/justfile` (fetch-wasi-sdk → clone → compile → verify) + `packages/wasm-genesis-gpgx/`.
