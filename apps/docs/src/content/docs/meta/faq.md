---
title: FAQ & Troubleshooting
description: WebAssembly, cross-origin isolation, audio, browser support, storage, and emulator quirks.
sidebar:
  order: 1
---

## WebAssembly, cross-origin isolation, and headers

madside runs entirely in your browser. The toolchains (MADS, the cc65 and z88dk C compilers, and the clownassembler M68k assembler) and the emulator cores (Altirra for Atari, Chips for C64 / ZX Spectrum, Genesis Plus GX for the Sega Genesis; the NES core is pure JavaScript) are compiled to **WebAssembly**, which every current browser supports out of the box.

You may have read that browser-based emulators need special HTTP headers — `Cross-Origin-Opener-Policy` (COOP) and `Cross-Origin-Embedder-Policy` (COEP). Those headers are only required to unlock `SharedArrayBuffer`. **madside does not use `SharedArrayBuffer`**, so it does **not** require cross-origin isolation, and the page works without those headers. Communication with the wasm cores goes through ordinary `postMessage` / typed-array copies instead.

:::note
This is a deliberate choice — it keeps hosting simple (any static host works) and avoids breaking when third-party scripts are present. If a future emulator plugin ever needs zero-copy shared memory, it would require COOP/COEP from whoever hosts that build; that's a per-deployment decision, not a requirement of madside today.
:::

If a wasm core fails to load, it's almost always one of:

- A network/CDN error fetching the `.wasm` file — reload the page.
- An ad-blocker or corporate proxy stripping the response — try a different network or disable the blocker for the site.

## Why is there no sound until I press Run?

Browsers block audio from starting until the user interacts with the page — an `AudioContext` is created suspended and only resumes after a user gesture. madside follows this rule: audio is started (resumed) when you press **Run**, and suspended again on **Pause** to free CPU.

So: no sound on page load is expected. Click **Run** and audio starts with the emulation. If you still hear nothing, check your system/browser volume and that the emulator panel is actually running (not paused).

## Browser support

madside targets current desktop browsers — Chromium-based (Chrome, Edge, Brave), Firefox, and Safari. It needs WebAssembly, IndexedDB, the Web Audio API, and ES modules, all of which those browsers ship.

Mobile browsers may load the IDE but are not a supported target — the layout, keyboard handling, and emulator focus model assume a physical keyboard and a pointer.

## Where are my projects stored? Can I lose them?

Your projects, files, and automatic snapshots live in your browser's **IndexedDB**, on the machine you're using. Nothing is uploaded to a server.

This has consequences worth knowing:

- **Clearing browser site data wipes your projects.** "Clear browsing data", "Clear site data", or a privacy tool that purges storage for the site will delete everything madside has saved. There is no cloud backup to restore from.
- **Private/incognito windows** typically discard storage when the window closes.
- **Storage is per-browser and per-device** — projects you created in Chrome won't appear in Firefox, or on another computer.

To keep a durable copy, **export your project as a ZIP** and store it yourself. See [Projects & storage](/docs/using/projects/) for export/import.

## The emulator quirks

### Stepping a frame while paused on a breakpoint

When you're paused on a breakpoint and press **Step Frame** (F11), madside temporarily clears breakpoints, advances exactly one display frame, then restores them. Without this, the very first instruction fetch would immediately re-trip the breakpoint you're sitting on, and the emulator would halt before producing a frame — so the display would appear not to advance. The clear-advance-restore dance makes Step Frame always advance a real frame regardless of where you paused, and your breakpoints are back in place for the next Run.

### NES accuracy

The NES core ([jsnes](https://github.com/bfirsh/jsnes)) is a fast, pure-JavaScript emulator. On the [AccuracyCoin](https://github.com/100thCoin/AccuracyCoin) hardware-reference suite it scores **106 / 131 (about 81%)** — solid mid-tier (for comparison, Mesen is ~100%, FCEUX ~90%).

CPU and most unofficial opcodes pass; the failures cluster in fine PPU timing and interrupt/DMA edge cases (DMC DMA cycles, OAM DMA bus conflicts, NMI-suppression cycle, sprite-overflow and OAM-corruption quirks). That's plenty for homebrew samples and learning — the failing ~19% are edge cases simple programs never touch. But if you rely on the *exact* timing of those behaviours, your code may run here yet glitch on real hardware: verify advanced timing tricks on Mesen or a real NES before shipping.
