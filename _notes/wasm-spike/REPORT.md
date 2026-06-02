# MADS → WASM spike

Build pipeline for `public/wasm/mads.wasm`. Was performed once (2026-05-30) in the blog
repo (`mikolajczyk.org/_notes/wasm-spike/`); ported into madside on 2026-05-31 so the IDE
owns its own toolchain. Runtime artifact (`mads.wasm`) lives in `public/wasm/`. Source
tree (`fpc-src/`, `Mad-Assembler/`) is **not** committed — cloned on demand by
`just build-mads-wasm` (see repo-root `justfile`). Pinned commits live in the justfile.

## Original spike notes (Retry 2, 2026-05-30)

### Setup

- FPC source: shallow-cloned `https://gitlab.com/freepascal.org/fpc/source.git`
  into `_notes/wasm-spike/fpc-src/` (HEAD `17c002e6`, FPC main / 3.3.1).
  `fpc-src` is not packaged in nixpkgs.
- Host compiler: `fpc` 3.2.2 from nixpkgs.
- Bootstrap shell: `nix-shell -p fpc gnumake wasmtime`.
- Bootstrap commands from the wiki recipe, verbatim:
  - `make clean OS_TARGET=wasip1 CPU_TARGET=wasm32 BINUTILSPREFIX= PP=$(which fpc)`
  - `make all   OS_TARGET=wasip1 CPU_TARGET=wasm32 BINUTILSPREFIX= PP=$(which fpc) \
       CROSSOPT="-O- -g- -CTbfexceptions -CTsaturatingfloattoint"`

Both ran clean, total wall time well under 30 min on this box.

### Does ppcwasm32.wasm build?

**Yes.** Two artifacts produced in `fpc-src/compiler/`:

- `ppcrosswasm32` — native x86_64 ELF host binary, 4.1 MB, targets wasm32-wasip1.
- `ppcwasm32.wasm` — same compiler as a wasm module, 8.4 MB.
  `wasmtime ppcwasm32.wasm -h` prints "Free Pascal Compiler version 3.3.1 …
  for wasm32".

Full RTL for wasm32-wasip1 was built under `fpc-src/rtl/units/wasm32-wasip1/`
plus rtl-objpas, fcl-base, fcl-json, wasm-utils, vcl-compat, wasm-job, wasm-oi.

### Does mads.wasm build?

**Yes**, with one trivial shim.

MADS 2.1.8 (`Mad-Assembler/mads.pas`) uses unit `crt` for `TextColor`,
`NormVideo` and color constants — `crt` has no wasip1 implementation in FPC.
Wrote a 30-line stub `Mad-Assembler/crt.pas` (no-op procedures, constants
only) and dropped it next to `mads.pas`.

Compile line:

```
ppcrosswasm32 -Twasip1 -Pwasm32 -Mdelphi -vh -O3 \
  -Fu<fpc-src>/rtl/units/wasm32-wasip1 \
  -Fu<fpc-src>/packages/rtl-objpas/units/wasm32-wasip1 \
  -Fu. mads.pas
```

Compiled cleanly (only the existing upstream "uninitialised local" hint, no
errors). Used the native `ppcrosswasm32` driver directly; did not need to wire
ppcwasm32.wasm through fpc.cfg.

### Does it produce a valid .xex?

**Yes — byte-for-byte identical to native mads.**

Test input `smoke.a65`:

```
	org $2000
start	lda #0
	rts
	run start
```

`wasmtime --dir=. mads.wasm smoke.a65` → `smoke.obx`, 15 bytes,
hex `ffff 0020 0220 a900 60e0 02e1 0200 20` — matches native `mads`
output exactly (`cmp` clean). MADS writes `.obx` by default when a `run`
directive is present; this is the standard Atari XEX format.

### Binary sizes

- `mads.wasm`: **1.9 MB** (native `mads_native` is 718 KB).
- `ppcwasm32.wasm`: 8.4 MB (only needed if we also ship the FPC compiler;
  not required just to run MADS).

### Performance

Trivial 4-line file: native 10 ms, wasm via wasmtime 15 ms. No noticeable
gap on toy input; real benchmarks pending.

### Recommendation

**Ship it.** The path is viable:

1. Vendor `mads.wasm` (1.9 MB) plus the tiny `crt.pas` shim in our build.
2. Run in browser via a wasi-in-browser shim, or server-side via wasmtime.
3. Bootstrap is reproducible from a stock nix-shell — wire it into
   `flake.nix` as a `mads-wasm` package when ready.

Caveats worth tracking before production:
- `crt` stub no-ops `TextColor`/`NormVideo` — fine for headless use, would
  drop ANSI colour in an interactive web terminal.
- Only smoke-tested one file. Run the MADS regression suite through wasmtime
  before claiming parity on macros, includes, conditional asm.
- FPC main (3.3.1) is unreleased — pin commit `17c002e6` in our recipe.

No blockers found.
