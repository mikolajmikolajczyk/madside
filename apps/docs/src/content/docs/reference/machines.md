---
title: Machines
description: Machine, toolchain, emulator, and debug-adapter matrix.
sidebar:
  order: 5
---

## Compatibility matrix

| Machine | id | CPU | Toolchains | Emulators | Output |
|---------|----|-----|------------|-----------|--------|
| Atari 800XL / 130XE | `atari-xl` | `mos6502` | `mads`, `cc65` | `altirra-wasm` | `.xex` |
| Nintendo Entertainment System (NTSC) | `nes` | `ricoh-2a03` | `mads`, `cc65` | `jsnes` | `.nes` |

Both machines accept two toolchains: `mads` (assembly only) and `cc65` (C,
plus ca65 assembly). cc65 targets the NES as an iNES `.nes` ROM and the Atari
as a `.xex`.

Each value comes from the machine plugin's `id`, `cpu`, `compatibleToolchains`,
and `compatibleEmulators`.

## Toolchains

| Toolchain id | Name | Language | Input ext | Output ext |
|--------------|------|----------|-----------|------------|
| `mads` | Mad-Assembler (MADS) | assembly | `a65`, `asm`, `inc` | `xex` |
| `cc65` | cc65 (C / ca65 / ld65) | C + ca65 assembly | `c`, `s`, `asm`, `h`, `inc` | `nes` / `xex` |

`cc65` bundles the cc65 C compiler, the ca65 assembler, and the ld65 linker
(all WebAssembly). It compiles C and ca65 assembly for both NES (→ iNES `.nes`)
and Atari 8-bit (→ `.xex`); the output extension is chosen per target. `mads`
stays the assembly-only toolchain.

## Emulators

| Emulator id | Backend | Machine |
|-------------|---------|---------|
| `altirra-wasm` | Altirra (wasm core) | Atari (`atari-xl`) |
| `jsnes` | jsnes | NES (`nes`) |

## Debug adapters

| Adapter id | Name | Notes |
|------------|------|-------|
| `atari-6502-debug` | Atari 6502 (Altirra) | Generic MOS 6502 register/flag layout. The NES reuses the shared `MOS6502_*` descriptor tables. |

## Default panels

Machines recommend a default panel layout:

| Machine | Default panels |
|---------|----------------|
| `atari-xl` | `memory`, `registers`, `output`, `asset` |
| `nes` | `memory`, `registers`, `ppu`, `output` |
