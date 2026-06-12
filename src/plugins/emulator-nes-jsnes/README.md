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
- **Trap or breakpoints present** → own the loop: `cpu.emulate()` + `papu.clockFrameCounter()` per instruction, checking the trap + breakpoint set after each.

Known gap (`TODO(frame-parity)` in `jsnes-backend.ts`): the debug path does not drain `cpu.cyclesToHalt` via `ppu.advanceDots(3)`, so OAM-DMA stall cycles slightly under-advance the PPU while single-stepping through a DMA. Irrelevant for step-debugging basic homebrew; matters for cycle-counted DMC tricks. The fast path (most running) is unaffected.

## Skeleton status

Structure + verified API mapping compile against `RunBackend`. Still stubbed (`TODO(skeleton)`):

- Framebuffer colour conversion is implemented (0x00RRGGBB → canvas 0xAABBGGRR) but the exact `MachinePlugin.display.pixelFormat` choice is deferred to the machine-nes plugin.
- `onAudioSample` → AudioWorklet sink wiring (mirror the Altirra POKEY tap).
- `sendKey` → jsnes controller mapping (a `MachinePlugin.input` concern, separate issue).

Not yet registered in `createWorkbench` — that happens with the machine-nes plugin + `project.json` emulator dispatch (other M9 children).
