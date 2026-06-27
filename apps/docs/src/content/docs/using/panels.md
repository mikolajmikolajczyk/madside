---
title: Panels
description: Registers, memory, variables, output, and machine-specific viewers.
sidebar:
  order: 6
---

The workbench is a **dockable layout** (powered by Dockview): every panel — the
editor, the emulator, and each debug panel — is a draggable surface you can
re-dock, split, float, or hide. Toggle any panel from the **View** menu, drag a
tab to move it, or save your arrangement as a named preset. The layout is
serialized and restored across reloads. madside ships several built-in panels and
lets machine plugins add their own.

## Built-in panels

- **Registers** — CPU registers and condition flags, descriptor-driven so they render correctly per machine (6502 for Atari/NES/C64, Z80 for the ZX Spectrum). See [Debugging](/docs/using/debugging/#registers-and-flags).
- **Memory** — a hex + ASCII dump with a base-address input, cursor following, and named memory regions. See [the memory viewer](/docs/using/debugging/#the-memory-viewer).
- **Variables** — debugger-style variable inspection. With a C build it shows each global typed, decodes its live value, and expands `struct` / array / pointer into a tree; you can add **watch expressions** (`pos.x`, `*ptr`, `arr[3]`, `p->next`). Without type info (assembly builds) it falls back to a flat symbol-table list. See [Variables](/docs/using/debugging/#variables).
- **Output** — the toolchain's stdout/stderr with an OK / ERR tag. The last build's output is persisted, so it restores after a page reload rather than going blank. See [Building](/docs/using/building/#the-output-panel).

They refresh on their own from build and debug events — there's nothing to wire up.

> **Outline** and **References** are LSP-driven editor surfaces (not panel plugins) — also dockable from the View menu. See [the editor](/docs/using/editor/).

## Machine-specific panels

Machine plugins can contribute extra panels. The NES ships a **PPU viewer** that reads the machine's PPU and OAM memory spaces and renders the palette and both pattern tables. The Genesis ships a **VDP viewer** that reads the VDP's CRAM, VRAM, and registers and renders the four palette lines, all of video memory decoded as 8×8 tiles, and the live sprite layer (each sprite drawn at its on-screen position with its own palette and flip). Click a palette line (or the 0–3 buttons) to recolour the tiles with it.

## How the default panels are chosen

The panels that appear (and their order) are resolved like this:

1. If the project's `project.json` lists a `panels` array, that wins.
2. Otherwise the active machine's default panel list is used.
3. Otherwise it falls back to **Registers** + **Memory**.

A panel id with no registered plugin is skipped. So an Atari project shows Memory / Registers / Variables / Output (+ Asset), in that order, while an NES project additionally shows the PPU viewer. See the [per-machine default panels](/docs/reference/machines/#default-panels).

To pin a specific set, add a `panels` array to your manifest:

```json
{
  "version": 2,
  "name": "nes-hello",
  "machine": "nes",
  "toolchain": "mads",
  "main": "src/nes-hello.a65",
  "panels": ["registers", "memory", "variables", "ppu", "output"]
}
```
