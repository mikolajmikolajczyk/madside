# Rebuilding `altirra-core.wasm`

Altirra wasm core ships in the `@madside/wasm-altirra` package at `packages/wasm-altirra/altirra-core.{wasm,js}` (~4.5 MB + 131 KB). Vite hashes both files at build time and the emu adapter (`apps/ide/src/adapters/emu/`) imports the `.js` statically + the `.wasm` via `?url` (handed to Emscripten's `locateFile`) through the package index. Built from a fork of `ilmenit/AltirraSDL`.

## Fork

- Repo: `github.com/mikolajmikolajczyk/AltirraSDL`
- Branch: `madside-embed`
- Lives as sibling: `_notes/altirra/` (separate repo, sibling of madside checkout)

## Source surface

- `_notes/altirra/src/AltirraEmbed/bindings.cpp` — core Embind facade. Most critical file. Exposes CPU/memory/breakpoints/audio/keyboard.
- `_notes/altirra/src/AltirraEmbed/CMakeLists.txt` — new CMake target gated by `-DALTIRRA_EMBED=ON`. Excludes ImGui/GL/netplay/SDL audio+video. emcc linker flags `-lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAltirraCore`.
- `_notes/altirra/flake.nix` — pinned nix dev shell (cmake 4.1, gcc 15.2, emscripten 5.0.6, sdl3 3.4.8).

## Build commands

Run from `build/` (the recipes live in `build/justfile`):

```sh
cd build && just build-altirra-wasm     # one-shot: configure → compile → install
# or split:
cd build && just altirra-configure
cd build && just altirra-compile
cd build && just install-altirra-wasm   # copy artifact into packages/wasm-altirra/
cd build && just clean-altirra-build    # nuke the fork's build/ dir
```

## Key design choices baked in

- `Advance(false)` per scanline, not `(true)` per frame.
- Frame boundary detection via `ATBridgeNullVideoDisplayConsumeFramePosted`.
- Single-instruction step via `dbg->StepInto(Disasm)` + walk `Advance(false)` until `Stopped`.
- Stable PC sampling: `mLastStablePC` cached only at `!IsInstructionInProgress()` boundary.
- `IATAudioTap::WriteRawAudio` collects samples; JS pulls via `getAudioSamples()` in `ScriptProcessorNode.onaudioprocess`.
- Memory clear forced to `kATMemoryClearMode_Zero` at boot (default `DRAM3` pattern is misleading post-reset).

## Upstream-friendly delta

CMake flag `-DALTIRRA_EMBED=ON` keeps the change PR-able. Discipline: **no upstream file edits** unless gated behind the flag.

## Known limits (M2 deferred)

- **Per-step display refresh** — `CreateSnapshot` + `ApplySnapshot` trick leaves `mbRunning=true` inconsistent with debugger linkage; next `StepInto` short-circuits on `IsRunning()`. Workaround: Frame button advances one frame.
- **ATR disk** — no SIO disk drive wired. xex-only.
- **Audio worklet** — `ScriptProcessorNode` (deprecated) used for now; AudioWorklet migration tracked as a Radicle issue.

Tracked issues:
- `c309619` per-step display refresh
- `3b73e5d` multi-format loader (ATR/CAR/CAS)
- `c5aaf5a` complete sendKey mapping
- `40e0373` hardware-config Embind setters
- `7353947` dynamic GTIA dims
- `c2dc46b` dynamic sample rate
- `27fa821` migrate to AudioWorklet
