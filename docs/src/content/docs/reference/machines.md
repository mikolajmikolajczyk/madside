---
title: Machines
description: Machine, toolchain, emulator, and debug-adapter matrix.
sidebar:
  order: 5
---

## Compatibility matrix

| Machine | id | CPU | Toolchains | Emulators | Output |
|---------|----|-----|------------|-----------|--------|
| Atari 800XL / 130XE | `atari-xl` | `mos6502` | `mads` | `altirra-wasm` | `.xex` |
| Nintendo Entertainment System (NTSC) | `nes` | `ricoh-2a03` | `mads` | `jsnes` | `.nes` |

Each value comes from the machine plugin's `id`, `cpu`, `compatibleToolchains`,
and `compatibleEmulators`.

## Toolchains

| Toolchain id | Name | Input ext | Output ext |
|--------------|------|-----------|------------|
| `mads` | Mad-Assembler (MADS) | `a65`, `asm`, `inc` | `xex` |

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
