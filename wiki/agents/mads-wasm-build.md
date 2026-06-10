# Rebuilding `mads.wasm`

The MADS assembler ships as a wasm32-wasip1 binary in `public/wasm/mads.wasm`. Pipeline lives in this repo: `_notes/wasm-spike/` + `justfile`.

## One command

```sh
just build-mads-wasm
```

What it does:

1. Clones FPC + Mad-Assembler at the pinned commits (in `justfile`).
2. Bootstraps the FPC wasm32-wasip1 cross-compiler.
3. Builds MADS via that compiler with the `crt.pas` shim.
4. Copies the resulting `mads.wasm` into `public/wasm/`.

Sources land in `_notes/wasm-spike/build/` (gitignored).

## Host requirements

Assumed on `PATH`: `fpc` 3.2.2+, `gnumake`, `git`, `wasmtime` (for smoke test). Recommended: `nix-shell -p fpc gnumake wasmtime`.

## Files we own

- `_notes/wasm-spike/crt.pas` — 30-line stub. MADS imports `crt` only for `TextColor` / `NormVideo`; wasip1 RTL has no `crt`.
- `_notes/wasm-spike/smoke.a65` — minimal program used to verify byte-exact xex output.
- `_notes/wasm-spike/REPORT.md` — historical spike notes (sizes, perf, rationale).

## Output

`mads.wasm` ≈ 1.9 MB. Byte-for-byte identical `.xex` to native MADS on smoke tests.

## When to rebuild

**Do not rebuild casually.** Bump the pinned commits in `justfile` deliberately, rerun `just build-mads-wasm`, smoke-test, then commit the new `public/wasm/mads.wasm`.
