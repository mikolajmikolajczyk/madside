# Emulator layer placement: Altirra in @adapters, jsnes in @plugins

**Date:** 2026-06-16
**Status:** accepted
**Context:** issue #16 (architecture polish) flagged the asymmetry as a possible inconsistency.

## Decision

The two emulator backends live in different layers **by design**, and that is the rule going forward:

- **`jsnesEmulator` → `@plugins/emulator-nes-jsnes`.** jsnes is a pure-JS npm dependency consumed directly. It needs no adapter-level glue, so it is a plain plugin like any other.
- **`altirraEmulator` → `@adapters/emu`.** Altirra is a vendored Emscripten/wasm core (`./wasm/altirra-core.js` + `.wasm`). Booting it needs adapter-level concerns — `locateFile`, the Embind surface, exception-pointer decoding, lazy module instantiation, the wasm asset URL. That glue *is* an adapter; the `EmulatorPlugin` object in `@adapters/emu/emulator.ts` is the thin, port-facing wrapper the workbench registers and resolves like any other plugin.

## Rule

> A backend that is a self-contained JS library is a `@plugins` plugin. A backend that wraps a wasm/native core (or any host-resource glue) is a `@adapters` adapter, exposing an `EmulatorPlugin` from the adapter so the workbench still resolves it uniformly through the `PluginRegistry`.

Both satisfy the same `EmulatorPlugin` contract and the same `RunBackend` port (after #16 dropped the legacy `EmuBackend` interface — `AltirraBackend implements RunBackend` directly). The placement difference is about *where the implementation's dependencies sit*, not about the contract.

## Consequences

- No move planned. Relocating the Altirra wasm core into `@plugins` would drag Emscripten glue + the `.wasm` asset into the plugin layer for no benefit.
- New backends follow the rule: pure-JS → `@plugins`; wasm/native → `@adapters` with an `EmulatorPlugin` wrapper.
