---
title: Machines
description: Machine, toolchain, emulator, and debug-adapter matrix.
sidebar:
  order: 5
---

## Compatibility matrix

| Machine | id | CPU | Toolchains | Emulator | Debug adapter | Output |
|---------|----|-----|------------|----------|---------------|--------|
| Atari 800XL / 130XE | `atari-xl` | `mos6502` | `mads`, `cc65` | `altirra-wasm` | `atari-6502-debug` | `.xex` |
| Nintendo Entertainment System (NTSC) | `nes` | `ricoh-2a03` | `mads`, `cc65` | `jsnes` | `atari-6502-debug` | `.nes` |
| Commodore 64 (PAL) | `c64` | `mos6510` | `cc65`, `mads` | `chips-c64` | `atari-6502-debug` | `.prg` |
| ZX Spectrum 48K | `zx-spectrum` | `z80` | `z88dk` | `zx-chips` | `zx-z80-debug` | `.sna` |
| Sega Mega Drive / Genesis | `genesis` | `m68000` | `clownassembler` | `genesis-gpgx` | `m68k-debug` | `.bin` |

Five machines across three CPU families. The 6502 family (Atari, NES, C64) shares
the `mads` and `cc65` toolchains and the `atari-6502-debug` adapter (a generic MOS
6502 register/flag layout); the ZX Spectrum runs the z80 `z88dk` toolchain with its
own Z80 adapter; the Sega Genesis runs the Motorola 68000 (`clownassembler`
assembler + the `genesis-gpgx` full-system emulator) with the `m68k-debug` adapter.

Each value comes from the machine plugin's `id`, `cpu`, `compatibleToolchains`,
`compatibleEmulators`, and `compatibleDebugAdapters`.

## Toolchains

| Toolchain id | Name | Language | Input ext | Output ext |
|--------------|------|----------|-----------|------------|
| `mads` | Mad-Assembler (MADS) | assembly | `a65`, `asm`, `inc` | `xex` |
| `cc65` | cc65 (C / ca65 / ld65) | C + ca65 assembly | `c`, `s`, `asm`, `h`, `inc` | `nes` / `xex` / `prg` |
| `z88dk` | z88dk (z80asm) | C + z80 assembly | `c`, `asm`, `s`, `inc`, `h` | `sna` |
| `clownassembler` | clownassembler (M68k) | assembly | `asm`, `s`, `68k`, `i`, `x68` | `bin` |

`cc65` bundles the cc65 C compiler, the ca65 assembler, and the ld65 linker (all
WebAssembly). It compiles C and ca65 assembly for the NES (→ iNES `.nes`), Atari
8-bit (→ `.xex`), and C64 (→ `.prg`); the output extension is chosen per target.
`z88dk` bundles the sccz80 C compiler + z80asm assembler (WebAssembly) and targets
the ZX Spectrum (→ `.sna` snapshot). `mads` stays the 6502 assembly-only toolchain.
`clownassembler` is the Motorola 68000 assembler (asm68k / SN-68k syntax,
WebAssembly) for the Sega Genesis, emitting a flat `.bin` ROM.

> C language intelligence (completion / hover / go-to-def / diagnostics) is served
> by the in-repo `@madside/lsp-*` server — a language-agnostic core with per-dialect
> engines for cc65 (6502) and sccz80/z88dk (z80). See [the editor](/docs/using/editor/).

## Emulators

| Emulator id | Backend | Machine |
|-------------|---------|---------|
| `altirra-wasm` | Altirra (wasm core) | Atari (`atari-xl`) |
| `jsnes` | jsnes | NES (`nes`) |
| `chips-c64` | Chips `c64-core` (wasm) | C64 (`c64`) |
| `zx-chips` | Chips `zx-core` (wasm) | ZX Spectrum (`zx-spectrum`) |
| `genesis-gpgx` | Genesis Plus GX (wasm core) | Genesis (`genesis`) |

## Debug adapters

| Adapter id | Name | Notes |
|------------|------|-------|
| `atari-6502-debug` | Atari 6502 (Altirra) | Generic MOS 6502 register/flag layout. NES and C64 reuse the shared `MOS6502_*` descriptor tables. |
| `zx-z80-debug` | ZX Spectrum Z80 (chips) | Z80 layout — `PC`/`SP`/`AF`/`BC`/`DE`/`HL`/`IX`/`IY`/`IR` + the `AF'`/`BC'`/`DE'`/`HL'` shadow set. |
| `m68k-debug` | Motorola 68000 (Genesis) | 68000 layout — `D0`–`D7`/`A0`–`A7`/`PC`/`SR` + the `X N Z V C` condition flags. |

## Default panels

Machines recommend a default panel set (dockable — drag, float, or toggle from the
**View** menu):

| Machine | Default panels |
|---------|----------------|
| `atari-xl` | `memory`, `registers`, `variables`, `output`, `asset` |
| `nes` | `memory`, `registers`, `variables`, `ppu`, `output` |
| `c64` | `memory`, `registers`, `variables`, `output` |
| `zx-spectrum` | `memory`, `registers`, `variables`, `output` |
| `genesis` | `memory`, `registers`, `variables`, `output` |
