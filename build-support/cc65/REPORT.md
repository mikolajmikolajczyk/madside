# Spike: ca65 / ld65 → WebAssembly (WASI)

**Question (#1):** can the cc65 assembler (`ca65`) and linker (`ld65`) build to
wasm/wasi at all, before committing to a fork + toolchain pipeline?

**Answer: yes — cleanly, with zero source changes.** Both tools compile, run,
and produce byte-correct 6502 output as `wasm32-wasip1`.

## What was done

1. Downloaded **wasi-sdk-33.0** (clang 22.1.0, target `wasm32-unknown-wasip1`,
   bundled `wasi-sysroot`). This is the C analogue of the FPC cross-compiler the
   MADS spike used — cc65 is C, so wasi-sdk is the natural toolchain (NOT
   emscripten: we want a pure WASI command module, same as `mads.wasm`).
2. Shallow-cloned **cc65** (`git cc3c40c`, reports as V2.19).
3. Built just the two tools, overriding the compiler/archiver:

   ```sh
   SDK=.../wasi-sdk
   make -C src ca65 ld65 CC=$SDK/bin/clang AR=$SDK/bin/llvm-ar
   ```

   cc65's `src/Makefile` is clean: `CC`/`AR` are overridable, and `make ca65
   ld65` builds only those two from `ca65/*.c` + `ld65/*.c` + `common/common.a`.
   **No source edits, no shims, no Makefile patches.** (MADS needed a `crt.pas`
   stub; cc65 needs nothing — it only touches stdio / file I/O / args / malloc,
   all first-class in WASI.)

## Artifacts

| Tool | Size | Format |
|------|------|--------|
| `ca65` | 543 KB | WebAssembly MVP, wasm32-wasip1 |
| `ld65` | 477 KB | WebAssembly MVP, wasm32-wasip1 |

Both ~4× smaller than `mads.wasm` (1.9 MB).

## Smoke test (node's built-in WASI, preview1)

- `ca65 --version` → `ca65 V2.19 - Git cc3c40c`, exit 0.
- Full pipeline on a minimal program:

  ```asm
  .segment "CODE"
  .org $0600
  start:  lda #$42
          sta $0200
          rts
  ```

  `ca65 -o hello.o hello.s` (exit 0, 669-byte object) → `ld65 -C none.cfg -o
  hello.bin hello.o` (exit 0). Output bytes:

  ```
  a9 42 8d 00 02 60   ; LDA #$42 / STA $0200 / RTS — byte-perfect
  ```

The WASI shim used for the smoke is node's `node:wasi`; in-app we already depend
on `@bjorn3/browser_wasi_shim` (same one MADS uses), so the browser path is the
same shape.

## Whole suite (follow-up: "what about C?")

cc65 is a **C** compiler (C89 + some C99) — there is no C++ for the 6502. Built
the rest of the suite the same way (`make -C src <tool> CC=… AR=…`):

| Tool | Role | WASI build |
|------|------|-----------|
| `cc65` | C → 6502 asm | ✅ wasm |
| `ca65` | asm → object | ✅ wasm |
| `ld65` | link | ✅ wasm |
| `co65` | o65 object convert | ✅ wasm |
| `ar65` | `.lib` librarian | ❌ `undefined symbol: getpid` |

`cc65` smoke — compiling a tiny C program with `cc65 -O -t none -o hello.s
hello.c` (exit 0) emits correct cc65 assembly (`.setcpu "6502"`, exported
`_main`/`_add`/`_counter`, the standard zp imports). So the **full C pipeline**
is `cc65 → ca65 → ld65` (three WASI runs from the JS host; `cl65` not needed).

**`ar65` was the only failure**, and it's now fixed. It calls `getpid()` in two
spots (`ar65/library.c:259`, `common/fname.c:173`) — both *only* to build a
unique temp-file name while rewriting an archive. WASI has no process model, so
`getpid` is undefined. But a single-shot wasm run needs no real PID (the
existing `Counter` already gives intra-run uniqueness), so a constant stub is
correct:

```c
int getpid(void) { return 1; }   /* getpid_stub.c */
```

Compile it once and add `getpid_stub.o` to the link — **no cc65 source change**.
Verified: relinked `ar65` builds + runs in wasm; `ar65 a test.lib hello.o`
produced a 704-byte archive (exit 0) and `ar65 t test.lib` listed `hello.o`.

**When is `ar65` actually needed?** Rarely, in our context:
- Building the per-target `.lib` archives (runtime + C stdlib: `nes.lib`,
  `c64.lib`, neslib, …) from their `.o` files. Done **once**, offline — could
  even use native `ar65`. Then the `.lib` is bundled as an asset.
- A power user packaging their own reusable 6502 routines into a `.lib`.

It is **not** on the normal compile→assemble→link path: `ld65` links loose `.o`
files directly, so we can bundle the runtime as loose objects (or a pre-built
`.lib`) and never run `ar65` client-side. With the stub it's available anyway,
at zero cost.

## Do we need a fork? (the open question)

**Not for the assembler/linker build itself** — stock cc65 master builds clean
to WASI. A fork would only earn its keep later, for one of:

- **Bundling the cc65 runtime** (`cfg/`, `lib/*.o`/`*.lib`, `include/`, and
  neslib) so real NES/C64 targets link without the user supplying a config +
  runtime. That's data, not a code fork — could ship as bundled assets instead.
- **Pinning / reproducibility** (a `justfile` like the MADS one, pinning the
  cc65 + wasi-sdk commits).
- **Full C compilation** (`cc65` proper, + `cl65` driver) — `cl65` *spawns*
  sub-processes, which WASI doesn't have. For C we'd orchestrate cc65 → ca65 →
  ld65 as three separate wasm invocations from the JS host instead of using
  `cl65`. (Assembly-only — `ca65` + `ld65` — sidesteps this entirely.)

So: **ToolchainPlugin for ca65/ld65 (assembly) is viable with stock binaries.**
The two-step shape (assemble each `.s` → `.o`, then `ld65` link with a target
`.cfg`) is more than MADS's single-shot, but each step is a clean WASI run.

## Reproduce / build inputs (this dir, all gitignored scratch)

- `wasi-sdk/` — wasi-sdk-33.0 x86_64-linux (≈640 MB extracted; delete when done).
- `cc65/` — shallow clone; built tools at `cc65/bin/{ca65,ld65}`.
- Smoke runner: `node --no-warnings <wasi-run.mjs> cc65/bin/ca65 <args>` with a
  `/tmp/ca65work` preopen as `/`.

Pins: **cc65 `cc3c40c`**, **wasi-sdk `33.0`**, clang `22.1.0`.
