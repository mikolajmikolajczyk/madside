# Building `clownassembler.wasm`

Motorola **68000** assembler for the Sega Genesis/Mega Drive toolchain (#145, Phase A).
[clownassembler](https://github.com/Clownacy/clownassembler) is an **AGPL-3.0-or-later**
(= madside's licence) clone of `asm68k`/SN-68k — the idiomatic Genesis homebrew
syntax. Portable ANSI C; the artifact ships at `packages/wasm-clownassembler/clownassembler.wasm`.

## Why it's an easy build

- The flex/bison output (`lexical.c`, `syntactic.c`) is **committed** to the repo —
  no flex/bison needed at build time, just `clang`.
- The code is **wasi-clean**: no `shm_open`/`mmap`/`fork`/`system`/`exec`. Pure
  file I/O over wasi-libc.
- So the whole build is a single `clang --target=wasm32-wasip1` pass over ~13 `.c`
  files (the Makefile's `clownassembler` "custom frontend" target), plus the
  `clowncommon` submodule header.

## The one patch (`patch-p2bin.py`)

`p2bin.c` (AS code-file → flat binary) uses `setjmp`/`longjmp` for a localized
EOF error-recovery. wasi-sdk's `setjmp.h` is gated behind the wasm
Exception-handling proposal, and **wasi-sdk 33 ships no target-side SjLj runtime**
(`__wasm_setjmp`/`__wasm_longjmp` are undefined at link). So `build-clownassembler.sh`
runs `patch-p2bin.py`, which replaces the jump buffer with a `static cc_bool
read_error` flag set in `ReadByte`/`ReadBytes` and checked at the top of the
record loop in `ProcessRecords`. Idempotent; a no-op once applied.

## Rebuild

```sh
cd build && just build-clownassembler-wasm
```

Runs `fetch-wasi-sdk` → `clone-clownassembler` (pinned commit + `clowncommon`
submodule) → `compile-clownassembler-wasm` (patch + clang) → `verify-clownassembler-wasm`.

The pin lives in [`build/third-party.toml`](../../build/third-party.toml)
(`[source.clownassembler].ref`); the recipe + the wasi-sysroot flags are in
[`build/justfile`](../../build/justfile) and
[`build/support/clownassembler/`](../../build/support/clownassembler/).

## Smoke

`verify-clownassembler-wasm` assembles `move.w #$1234,d0` and checks the output is
`30 3c 12 34` (the instruction's exact encoding), running the wasm through the
shared [`build/support/cc65/wasi-run.mjs`](../../build/support/cc65/wasi-run.mjs)
harness.

## CLI (custom frontend)

`clownassembler -i <in.asm> -o <out.bin> [-l listing] [-s symbols] …` — arg-based;
see `frontend_custom.c`. (The repo also builds an `asm68k`-CLI-compatible frontend;
we ship the custom one for a stable interface.)
