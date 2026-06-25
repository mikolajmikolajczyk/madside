# Building `genesis-gpgx.wasm` (#145, Phase B)

> **Status: built + wired.** Full-system Sega Mega Drive backend (VDP +
> YM2612/PSG + Z80 + I/O) over [Genesis Plus GX](https://github.com/ekeeke/Genesis-Plus-GX).
> Rebuild: `cd build && just build-genesis-gpgx-wasm` (fetch wasi-sdk → clone →
> compile → smoke). Output: `packages/wasm-genesis-gpgx/genesis-gpgx.wasm` (~2.6 MB).

## What + why

gpgx is the Genesis emulator backend. **It embeds Musashi** (`core/m68k/`) as its
68000 core, so `@madside/debug-m68k` + `Cpu68kState` work unchanged on its m68k
context — Phase B swapped the *emulator* (replacing the earlier headless bare-Musashi
scaffold, since removed), not the toolchain/machine/debug.

## Licence (non-commercial)

gpgx is **non-commercial** ("may not be sold, nor used in a commercial product").
Handled like the other third-party cores: **aggregated** (a separate emulator-core
wasm the app instantiates over an API boundary, not linked into the AGPL TS code) +
**disclosed** (`third-party.toml [source.genesis-plus-gx]`). madside's own code
stays AGPL; the assembled IDE is not commercially redistributable, but **games
users build are unaffected (commercial-OK)** — the emulator contributes no code to
a ROM. See [[licensing-stance]]. Pinned ref `c7ecd07`.

## Build approach (wasi-sdk reactor)

- **wasi-sdk clang, `-mexec-model=reactor`** — exported fns, no `_start`. NOT
  emscripten. Single clang pass: gpgx commits its m68k tables (`m68kops.h`,
  `m68ki_instruction_jump_table.h`, `m68ki_cycles.h`) so there's **no host m68kmake**.
- **setjmp shim** (`build/support/genesis-gpgx/shim`):
  wasi-sdk has no SjLj runtime; m68k only uses setjmp for the address-error trap,
  which the harness keeps dormant (`config.addr_error = 0` + `m68k.aerr_enabled = 0`).
- `-DLSB_FIRST` (wasm is little-endian), `-DUSE_32BPP_RENDERING` (0xAARRGGBB
  framebuffer, alpha forced 0xFF — the `xrgb8888` blit path in `Emulator.tsx`).

## File set (decided: compile cd_hw, exclude only libchdr + tremor)

`build/support/genesis-gpgx/build-genesis-gpgx.sh` compiles every `core/*.c`
subtree — `core`, `z80`, `m68k`, `ntsc`, `sound`, `input_hw`, `cart_hw`,
`cart_hw/svp`, **and `cd_hw`** — plus `libretro/scrc32.c` (for `crc32`, used by
`sms_cart.c`/`sram.c`) and the harness. **Excluded:** `cd_hw/libchdr/**` +
its zstd/lzma/zlib deps (CHD — `USE_LIBCHDR` left undefined) and `sound/tremor`
(OGG Vorbis CD audio — `USE_LIBVORBIS`/`USE_LIBTREMOR` left undefined). `minimp3`
is header-only. Compiling cd_hw (6 files) was cleaner than excluding it and
stubbing the `scd_*`/`cdd_*` symbols `mem68k.c`/`system.c` reference.

## osd glue (no libretro-common)

`build/support/genesis-gpgx/osd.h` replaces `libretro/osd.h`: same contract
(`t_config` copied verbatim, the global `config` + BIOS path strings,
`load_archive`/`osd_input_update` prototypes, sprite-limit macros) but the file
stream layer is reduced to plain stdio (`cdStream` → `FILE`/`fopen`) so cd_hw
compiles, and `CHEATS_UPDATE` is left undefined so the `#ifdef CHEATS_UPDATE`
sites compile out (no `ROMCheatUpdate` needed). It must win over `libretro/osd.h`
on the include path — `-I support/genesis-gpgx` precedes `-I libretro`.

## Frontend harness (`genesis-gpgx-system.c`, reactor exports)

Replaces `libretro.c`. Supplies the frontend globals (`config`, BIOS strings,
`load_archive`, `osd_input_update`, the 720×576 32bpp `bitmap_data_`) and exports:

- `init()` — `init_config()` + `init_bitmap()` only. **System init is deferred to
  load** (system_init/reset configure VDP + memory map off the *detected*
  `system_hw`, so the ROM must be parsed first — mirrors libretro retro_load_game
  order: `load_rom` → `audio_init` → `system_init` → `system_reset`).
- `rom_ptr()` / `rom_capacity()` — staging buffer (`g_rom_data`, `MAXROMSIZE`).
- `load_rom_buffer(len)` — sets `g_rom_size`, calls `load_rom("game.bin")`
  (extension "BIN" → `SYSTEM_MD`), then audio_init/system_init/system_reset.
  ROM load is **buffer-based**: `load_archive` memcpy's `g_rom_data` → `cart.rom`
  (libretro's `g_rom_data` fast path) — no filesystem.
- `reset()`, `run_frame()` — `system_frame_gen(0)`; **returns `1` on a completed
  frame, `0` if a 68000 breakpoint trapped** (PC left at the breakpoint).
- `bp_ptr()` / `bp_capacity()` / `set_bp_count(n)` — 68000 breakpoints (#146). JS
  writes up to `bp_capacity()` addresses into `bp_ptr()[0..n)`, then `set_bp_count(n)`.
  `md_bp_check(pc)` (called per instruction from the patched `m68k_run` loop)
  trips on a match.
- `framebuffer()` + `fb_width/height/pitch/x/y()` — the live viewport within the
  720×576 bitmap.
- `get_reg(r)` — `m68k_get_reg(r)` (**1-arg** in gpgx). `read_byte(addr)` — decodes
  the 68000 bus via `m68k.memory_map[]` (READ_BYTE applies the LE byteswap).
- `audio_ptr()`/`audio_update()` — stereo S16; `set_input(port, buttons)` — pad bits.

## wasi instantiation gotcha

The core calls `fopen` (CD auto-detect in `load_rom` → `cdd_load`) before falling
through to the in-memory ROM path. With a blanket `() => 0` import stub,
`fd_prestat_get` looks successful → wasilibc trusts a bogus preopen → `_Exit` →
trap. Fix (in both the smoke and the TS backend): **`fd_prestat_get` /
`fd_prestat_dir_name` return EBADF (8)** so the preopen scan stops, `fopen`
returns NULL, and `cdd_load` returns 0 (proceeds to `load_archive`). `proc_exit`
throws rather than no-ops.

## TS side

- `packages/wasm-genesis-gpgx/` — artifact + `gpgxWasmUrl` (`?url`).
- `packages/emulator-genesis-gpgx/` — `EmulatorPlugin` id `genesis-gpgx` +
  `RunBackend`: reactor instantiate, per-frame viewport → `pixels` (re-derive the
  wasm view each frame; memory growth detaches it), stereo→mono audio downmix via
  `AudioPushPump`, pad input via `set_input`. Reuses `debug-m68k` unchanged.
- `machine-genesis`: `pixelFormat: 'xrgb8888'`, `compatibleEmulators:
  ['genesis-gpgx']`. Registered in `builtin-plugins.ts`.

## 68000 breakpoints (instruction-granular, #146)

gpgx is frame-scheduled, so a frame-boundary PC check almost never lands on a
breakpoint. `build-genesis-gpgx.sh` injects a one-line patch into the core's
`m68k_run` loop (right after `/* Decode next instruction */`, before the fetch):

```c
{ extern int md_bp_check(unsigned int); if (md_bp_check(REG_PC)) { m68k.cycles = cycles; break; } }
```

`md_bp_check` (in the harness) returns 1 on a breakpoint, stopping the loop with
PC **at** the breakpoint (not executed). Setting `m68k.cycles = cycles` first
consumes the timeslice — `m68k.cycles` is the shared 68k/Z80 time base, so
breaking without advancing it leaves the CPU perpetually behind and it never
resumes. The remaining in-frame `m68k_run` calls re-break at the same PC,
freezing the 68000 for the rest of the frame (VDP/Z80/audio still finish it). On
resume, `run_frame` sets a one-shot skip for the parked PC so the program can
step past its own breakpoint.

Why not gpgx's `HOOK_CPU` subsystem (which has a ready `cpu_hook(HOOK_M68K_E,…)`
in this exact spot)? Enabling `-DHOOK_CPU` also compiles the read/write hook
sites inlined into every memory accessor — that bloats codegen past a **wasi-sdk
clang-22 crash**. The single injected execute check sidesteps it. The patch is
idempotent and re-applied each build (the script `git checkout`s the pristine
core file first, since `git checkout <commit>` is a no-op when already on it and
won't discard a prior patch).

The build also needs no `setjmp`/`longjmp` (unavailable on wasm) — the
flag-and-break design never unwinds.

## Caveats / Phase-B follow-ups

- **No sub-frame single-step.** `step()` still advances a whole frame (a bare
  step has no target PC). Breakpoints, however, now trap instruction-granularly
  (above). The Z80 coprocessor has no execute hook, so its breakpoints stay
  frame-boundary.
- **VDP-space reads** (`readMem(.., 'vram'|'cram'|'vsram')`) throw — not yet wired.
- **save/loadState** carry CPU regs only — full snapshot needs `state.c` through a
  buffer export.
- A display-off ROM reports a small viewport (e.g. 256×192); a real game sets H40/V28
  → 320×224.

## Verify

`build/support/genesis-gpgx/smoke.mjs` (run by the justfile recipe): hand-built MD
ROM (`move.l #$12345678,d0`), load → run frames → check D0/PC/read_byte. The
end-to-end chain (assemble → gpgx → m68k-debug) is in
`tests/integration/genesis-68k.test.ts`; contract shape in
`tests/plugins/emulator/contract.test.ts`.
