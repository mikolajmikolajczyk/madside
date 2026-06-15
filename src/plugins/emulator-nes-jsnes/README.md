# emulator-nes-jsnes

NES emulator backend for the workbench, wrapping [jsnes](https://github.com/bfirsh/jsnes) `@2.1.0` behind the generic `RunBackend` contract.

Decision + accuracy baseline: Radicle issue `b41098c` (M9, milestone `v0.8.0`).

## Why jsnes

- Pure JS, ESM, **zero runtime deps**, 31 KB gzip (min). Clean for Vite.
- Apache-2.0 — one-way compatible with our AGPL-3.0 (ADR-0006).
- Exposes everything `RunBackend` + `DebugTarget` need: single-instruction step (`cpu.emulate()`), full register/flag file, raw + mapped memory, PPU viewer surface (`vramMem`, `spriteMem`, decoded `ptTile`/`nameTable`/palettes), save/load state (`toJSON`/`fromJSON`).
- Debug primitives are *easier* than the Altirra wasm path: we own the loop in JS, so step + breakpoints are a `while` with a PC check — no embind round-trips.

## Accuracy — measured

Ran [AccuracyCoin](https://github.com/100thCoin/AccuracyCoin) (140-test hardware-reference suite): **106/131 = 81%**.

- CPU + most unofficial opcodes: ~all pass → core execution correctness is solid.
- Fails cluster in **interrupts/DMA** (DMC DMA cycles, OAM DMA bus conflicts) and **PPU fine timing** (NMI suppression cycle, sprite overflow, OAM corruption).

81% is solid mid-tier (Mesen ~100%, FCEUX ~90%, lenient toys ~50–70%). Enough for homebrew samples + teaching — the failing 19% are edge cases simple homebrew never touches. Code relying on the exact timing of those behaviours may work here but glitch on real hardware; verify advanced timing tricks on Mesen / real NES before shipping.

The pick is **reversible**: a Mesen-class wasm core can drop in behind the same `RunBackend` contract later, or run alongside (fast jsnes to iterate, accurate core to final-verify).

## Internals coupling

A debugger needs `nes.cpu` / `nes.ppu` / `nes.papu`, which jsnes does **not** declare in its shipped `nes.d.ts` (they're plain-JS runtime objects). `jsnes-internals.ts` declares exactly the fields we touch. These are stable **only for the pinned jsnes version**. On a jsnes bump:

1. Re-verify every field in `jsnes-internals.ts` against the new `src/cpu.js` / `src/ppu/index.js`.
2. Re-check the `advanceFrame` debug loop against jsnes's own `frame()` (`src/nes.js`).

## frame-loop parity

jsnes's `frame()` traps only at frame granularity. Source-level breakpoints need per-instruction granularity, so `advanceFrame` has two paths:

- **No trap + no breakpoints** → call `nes.frame()` directly (DMA-correct, does the odd-frame / scanline bookkeeping).
- **Trap or breakpoints present** → own the loop: `stepInstruction()` per iteration, checking the trap + breakpoint set after each. `stepInstruction()` mirrors jsnes's `frame()` body cycle-for-cycle — including the `cpu.cyclesToHalt` branch that drains OAM-DMA / DMC halt cycles via `ppu.advanceDots(3)` instead of fetching the next opcode. So the debug path matches the fast path's PPU timing across DMA (#4).

## Status

Complete backend behind `RunBackend` / `EmulatorPlugin`:

- **Framebuffer** — `onFrame` blit (0x00RRGGBB → canvas 0xAABBGGRR).
- **Audio** — `onAudioSample` (stereo, mono-mixed) → accumulation buffer → ~5 ms push pump → `jsnes-audio` AudioWorklet sink. Mirrors the Altirra path; `startAudio`/`suspendAudio` drive it on Run / pause-stop. The context is pinned to the NES sample rate (no resampling).
- **Input** — `sendKey(buttonIndex, _, isDown)` → `nes.buttonDown/Up(1, …)`. The browser-key → button-index map lives in `machine-nes.input.codeToKey`.
- **Debug** — breakpoint-granular advance loop + DMA-faithful `stepInstruction` (above).

Registered as the `jsnes` `EmulatorPlugin` (`plugin.ts`); `createWorkbench` resolves it from `machine-nes.compatibleEmulators`.
