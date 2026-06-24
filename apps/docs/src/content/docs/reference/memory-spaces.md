---
title: Memory spaces
description: cpu, ppu, oam, and how readMemory addresses them.
sidebar:
  order: 4
---

A **memory space** is a named address space the debugger can read. The CPU bus
space, `cpu`, is implicit and always present. A machine plugin declares any
*extra* spaces it exposes via `memorySpaces`; viewer panels read them by id.

## Reading a space

The debug target exposes:

```ts
readMemory(addr: number, len: number, space?: string): Promise<Uint8Array>
```

- `space` defaults to the CPU bus when omitted or set to `'cpu'`; the address is
  masked to the 16-bit bus (`addr & 0xffff`).
- For any other space id, the address is passed through and the backend clamps it
  to that space's own range `[0, size)`.

## Spaces by machine

| Machine | Space id | Label | Size | Notes |
|---------|----------|-------|------|-------|
| Atari (`atari-xl`) | `cpu` | CPU bus | — | Implicit; only space. No extra `memorySpaces`. |
| C64 (`c64`) | `cpu` | CPU bus | — | Implicit; only space. |
| ZX Spectrum (`zx-spectrum`) | `cpu` | CPU bus | — | Implicit; only space. |
| NES (`nes`) | `cpu` | CPU bus | — | Implicit. |
| NES (`nes`) | `ppu` | PPU VRAM | `0x4000` (16 KB) | Pattern tables, nametables, palette. Read by the PPU viewer. |
| NES (`nes`) | `oam` | OAM | `0x100` (256 B) | Sprite attribute table. |
| Genesis (`genesis`) | `cpu` | CPU bus | — | 24-bit address bus. |
| Genesis (`genesis`) | `vram` | VDP VRAM | `0x10000` (64 KB) | Tiles, maps, sprites. Reads not served by the backend yet. |
| Genesis (`genesis`) | `cram` | VDP CRAM | `0x80` (128 B, 64 entries) | Palette. Reads not served by the backend yet. |
| Genesis (`genesis`) | `vsram` | VDP VSRAM | `0x50` (80 B) | Vertical-scroll values. Reads not served by the backend yet. |

The NES and the Genesis declare extra spaces; the Atari, C64, and ZX Spectrum
expose only the implicit `cpu` space.

The Genesis machine *declares* the three VDP spaces (`vram`, `cram`, `vsram`),
but the current Genesis emulator backend does **not** yet serve reads of them —
only the CPU bus is readable today. The VDP tile / palette / sprite viewers are a
pending follow-up.
