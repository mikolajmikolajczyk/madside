# Rebuilding `mads.wasm`

The MADS assembler ships as a wasm32-wasip1 binary in the `@madside/wasm-mads` package at `packages/wasm-mads/mads.wasm`. Pipeline: `build/justfile` + the committed build inputs in `build/support/mads/` (pins in `build/third-party.toml`); scratch builds in `_notes/wasm-spike/build/` (git-ignored).

## One command

```sh
cd build && just build-mads-wasm
```

What it does:

1. Clones FPC + Mad-Assembler at the pinned commits (in `build/justfile`).
2. Bootstraps the FPC wasm32-wasip1 cross-compiler.
3. Builds MADS via that compiler with the `crt.pas` shim.
4. Copies the resulting `mads.wasm` into the `@madside/wasm-mads` package at `packages/wasm-mads/` next to its loader (imported via the package index / Vite `?url`).

Sources land in `_notes/wasm-spike/build/` (gitignored).

## Host requirements

Assumed on `PATH`: `fpc` 3.2.2+, `gnumake`, `git`, `wasmtime` (for smoke test). Recommended: `nix-shell -p fpc gnumake wasmtime`.

## Files we own

- `build/support/mads/crt.pas` — 43-line stub. MADS imports `crt` only for `TextColor` / `NormVideo`; wasip1 RTL has no `crt`.
- `build/support/mads/smoke.a65` — minimal program used to verify byte-exact xex output.
- `build/support/mads/REPORT.md` — historical spike notes (sizes, perf, rationale).

## Output

`mads.wasm` ≈ 1.9 MB. Byte-for-byte identical `.xex` to native MADS on smoke tests.

## When to rebuild

**Do not rebuild casually.** Bump the pinned commits in `build/third-party.toml` deliberately, rerun `cd build && just build-mads-wasm`, smoke-test, then commit the new `packages/wasm-mads/mads.wasm`.
