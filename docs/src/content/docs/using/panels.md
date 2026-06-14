---
title: Panels
description: Registers, memory, output, and machine-specific viewers.
sidebar:
  order: 6
---

The debug column (the right-hand side panel, below the emulator) is a stack of **panels**. madside ships three built-in panels and lets machine plugins add their own.

## Built-in panels

- **Registers** — CPU registers and condition flags, descriptor-driven so they render correctly per machine. See [Debugging](/docs/using/debugging/#registers-and-flags).
- **Memory** — a hex + ASCII dump with a base-address input, cursor following, and named memory regions. See [the memory viewer](/docs/using/debugging/#the-memory-viewer).
- **Output** — the assembler's stdout/stderr with an OK / ERR tag. This panel is shown below the editor rather than in the debug column. See [Building](/docs/using/building/#the-output-panel).

All three refresh on their own from build and debug events — there's nothing to wire up.

## Machine-specific panels

Machine plugins can contribute extra panels. The NES ships a **PPU viewer** that reads the machine's PPU and OAM memory spaces and renders the palette and both pattern tables.

## How the default panels are chosen

The panels that appear (and their order) are resolved like this:

1. If the project's `project.json` lists a `panels` array, that wins.
2. Otherwise the active machine's default panel list is used.
3. Otherwise it falls back to **Registers** + **Memory**.

A panel id that has no registered plugin is skipped, and the **Output** panel is always rendered below the editor rather than in the column. So, for example, an Atari project shows Registers and Memory in the column with Output below the editor, while an NES project additionally shows the PPU viewer.

To pin a specific set, add a `panels` array to your manifest:

```json
{
  "version": 2,
  "name": "nes-hello",
  "machine": "nes",
  "toolchain": "mads",
  "main": "src/nes-hello.a65",
  "panels": ["registers", "memory", "ppu", "output"]
}
```
