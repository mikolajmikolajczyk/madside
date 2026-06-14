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
| NES (`nes`) | `cpu` | CPU bus | — | Implicit. |
| NES (`nes`) | `ppu` | PPU VRAM | `0x4000` (16 KB) | Pattern tables, nametables, palette. Read by the PPU viewer. |
| NES (`nes`) | `oam` | OAM | `0x100` (256 B) | Sprite attribute table. |

The Atari machine declares no extra spaces, so only the implicit `cpu` space is
available there.
