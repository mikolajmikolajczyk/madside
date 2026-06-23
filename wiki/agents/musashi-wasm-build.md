# Building `musashi.wasm`

The Motorola **68000** CPU core for the Sega Genesis/Mega Drive emulator backend
(#145, Phase A). [Musashi](https://github.com/kstenerud/Musashi) (MIT) + our
`musashi-system.c` harness, built as a **wasm32 reactor** (exported functions, no
`_start`) so the in-browser backend instantiates it and calls its API directly.
Artifact: `packages/wasm-musashi/musashi.wasm`.

## What the harness adds

`build/support/musashi/musashi-system.c` wraps the core in a minimal Genesis
memory bus — cartridge ROM (`$000000–$3FFFFF`, read-only) + 64K work RAM
(`$E00000–$FFFFFF`, mirrored) — and exports `init / load_rom / reset / run_cycles
/ get_reg / read_byte / rom_ptr / ram_ptr`. No VDP/sound yet (Phase B); the
framebuffer is blank.

## Two build stages

1. **Host** — Musashi ships `m68kmake`, not the generated opcode tables. A host
   `cc` builds + runs it: `m68kmake <gen> m68k_in.c` → `m68kops.{c,h}` (1967
   handlers).
2. **wasi reactor** — wasi-sdk clang compiles `m68kcpu.c` (which `#include`s
   `m68kfpu.c`) + the generated `m68kops.c` + `softfloat/softfloat.c` (FPU) + the
   harness, with `-mexec-model=reactor`.

## The setjmp shim

Musashi uses `setjmp`/`longjmp` for 68000 address/bus-error traps. wasi-sdk's
`<setjmp.h>` `#error`s without an SjLj runtime (none in wasi-sdk 33), so
`build/support/musashi/shim/setjmp.h` (first on the include path) stubs it:
`setjmp` returns 0 (the normal path is unaffected), `longjmp` is a hard trap. A
correct program never faults; one that does surfaces as a wasm trap rather than
emulating the exception (revisit in Phase B if proper fault emulation is needed).

## Rebuild

```sh
cd build && just build-musashi-wasm
```

`fetch-wasi-sdk` → `clone-musashi` (pinned commit) → `compile-musashi-wasm`
(host m68kmake + reactor clang) → `verify-musashi-wasm`.

The pin is in [`build/third-party.toml`](../../build/third-party.toml)
(`[source.musashi].ref`); the recipe + harness live in
[`build/justfile`](../../build/justfile) and
[`build/support/musashi/`](../../build/support/musashi/).

## Smoke

`verify-musashi-wasm` runs `smoke.mjs`: it instantiates the reactor, writes a
hand-built ROM (`move.l #$12345678,d0` after a vector table pointing the reset PC
at `$8`), runs it, and asserts the reset PC is `$000008` and `D0 == $12345678`.

## Licence

Musashi is MIT. The bundled `softfloat/` (FPU) is John R. Hauser's SoftFloat — a
permissive custom licence (redistribution with the legal notice, no warranty).
