---
title: Templates
description: Starting a project from a bundled template.
sidebar:
  order: 10
---

A **template** is a ready-made starting project — a manifest plus source files — bundled into madside. Templates are always available offline; there's nothing to download.

## Bundled templates

madside ships with:

- **Atari — Hello World** (`atari-hello`) — a minimal Atari (atari-xl) program in MADS assembly that writes to the screen via SAVMSC.
- **Atari — Hello (C, cc65)** (`atari-c-hello`) — the same idea in C: cc65 compiles `main.c`, ca65 assembles it, and ld65 links against the bundled Atari runtime into a `.xex`.
- **NES — Hello (background colour)** (`nes-hello`) — a canonical NES warmup (two VBlank waits) in MADS assembly that sets the universal background colour and enables rendering, emitting an NROM iNES ROM.
- **NES — Hello (C, cc65)** (`nes-c-hello`) — an NES program in C, linked with ld65 against the bundled NES runtime into an iNES ROM.
- **NES — APU Hello (square-wave tone)** (`nes-apu-hello`) — programs the NES APU pulse channel to play a steady tone; MADS assembly, no graphics.
- **C64 — Hello World (MADS)** (`c64-hello`) — a minimal Commodore 64 program in MADS assembly.
- **C64 — Hello (C, cc65)** (`c64-c-hello`) — a C64 program in C, linked with cc65 into a `.prg`.
- **ZX Spectrum — Hello World (z80asm)** (`zx-asm-hello`) — a minimal ZX Spectrum program in z80 assembly, built with z88dk.
- **ZX Spectrum — Hello (C, z88dk)** (`zx-c-hello`) — a ZX Spectrum program in C: sccz80 compiles it and z80asm/appmake produce a `.sna`.
- **Sega Genesis — Hello World (M68k asm)** (`genesis-asm-hello`) — a minimal Genesis program: clownassembler assembles a vector table + ROM header + VDP init that turns on the display and shows a solid blue background, ready to extend with tiles and a palette.
- **Sega Genesis — Z80 sound (M68k + Z80)** (`genesis-z80-sound`) — uses both of the Genesis' CPUs: the 68000 sets up the screen and boots the Z80 sound chip, and the Z80 plays a tone on the PSG. Your Z80 source (`src/sound/driver.s80`) is assembled automatically and embedded in the ROM. Extend the Z80 driver to play music or sound effects.
- **Empty project** (`empty`) — a blank project you fill in yourself.

The cc65 C templates use the **cc65** toolchain (cc65 → ca65 → ld65); the ZX C template uses **z88dk** (sccz80 → z80asm); the assembly templates use **mads** (6502) or **z88dk** (z80) — all in the browser.

## Starting from a template

Templates live on the **welcome screen** — shown on first run, after deleting your last project, or anytime via **File → New project**. The **Empty project** section at the top lets you edit the `project.json` before creating; below it are cards for each template showing its target machine and the files it ships. Click a card to instantiate it.

Picking a template copies its files into a fresh project in your browser storage. From there it's an ordinary project — edit it, [build](/docs/using/building/), and [run](/docs/using/running/) it like any other. See [Projects](/docs/using/projects/) for the manifest and file model.
