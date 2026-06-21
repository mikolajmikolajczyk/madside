# build-support

Committed **inputs** for building the third-party toolchains madside bundles as
WebAssembly. These are the small, hand-maintained files the `just build-*`
recipes feed to the upstream sources — our shims, helper scripts, and smoke
tests. The bulky scratch (cloned upstream sources, intermediate objects, the
AltirraSDL fork checkout) is **not** here: it lives under `_notes/`, which is
git-ignored and recreated on demand.

Pins (upstream repos + commits) and licences live in [`../third-party.toml`](../third-party.toml);
the generated licence table is [`docs/.../reference/third-party.md`](../docs/src/content/docs/reference/third-party.md).
Step-by-step build notes: [`wiki/agents/mads-wasm-build.md`](../wiki/agents/mads-wasm-build.md),
[`wiki/agents/altirra-wasm-build.md`](../wiki/agents/altirra-wasm-build.md).

## `mads/` — Mad-Assembler → `mads.wasm`

Built by `just build-mads-wasm` (Free Pascal cross-compiled to wasm32-wasip1).

- **`crt.pas`** — our 43-line stub of Turbo/FPC's `crt` console unit. MADS does
  `uses crt` for `TextColor` / `NormVideo`, but FPC's wasip1 RTL has no `crt`
  unit, so the cross-compile fails without it. The stub supplies the same
  interface (colour constants + `TextColor`/`ClrScr`/`GotoXY`/`KeyPressed`/
  `ReadKey`/`NormVideo`) as no-ops — irrelevant in the browser, where MADS emits
  its object file through the filesystem, not a terminal. **Ours, hand-written
  (not third-party).**
- **`smoke.a65`** — tiny source the `verify-mads-wasm` recipe assembles to prove
  the freshly built `mads.wasm` works.
- **`REPORT.md`** — the original spike write-up (how MADS was first taken to wasm).

## `cc65/` — cc65 / ca65 / ld65 → `*.wasm`

Built by `just build-cc65-wasm` (wasi-sdk clang, unmodified cc65).

- **`make-sysroot-zip.py`** — packs a target's C runtime (`<t>.lib` + `<t>.cfg`
  + headers) into the in-browser sysroot zip the toolchain plugin mounts.
- **`wasi-run.mjs`** — Node WASI harness the `verify-cc65-wasm` smoke uses to run
  the built `ca65`/`ld65` wasm tools.
- **`hello.s`, `none.cfg`** — smoke inputs (assemble + link, check the bytes).
- **`hello.c`, `getpid_stub.c`** — spike leftovers kept for reference: `hello.c`
  was the first C→ROM test; `getpid_stub.c` patched `ar65` (a 3-line `getpid`
  stub) — not on the build path, since the browser build skips `ar65`.
- **`REPORT.md`** — the cc65→wasm spike report (de-risking, zero source changes).

Altirra has no inputs here — it's built from our
[AltirraSDL fork](https://github.com/mikolajmikolajczyk/AltirraSDL/tree/madside-embed)
(the SDL3/wasm patches + flake live in that repo); `just build-altirra-wasm`
clones it at the pinned commit.
