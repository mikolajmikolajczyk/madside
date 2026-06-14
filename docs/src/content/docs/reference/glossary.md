---
title: Glossary
description: Atari, NES, and plugin terminology.
sidebar:
  order: 8
---

## Atari 8-bit

- **Atari XL/XE** — 8-bit home computer family (800XL, 130XE). 6502 CPU at ~1.79 MHz. The first machine madside targets.
- **ANTIC** — display list processor. Reads display lists from RAM, drives raster fetch, generates display interrupts.
- **GTIA** — graphics translator. Converts ANTIC pixel data and sprite data to video; the palette chip.
- **POKEY** — "pot keyboard." Audio (4 channels), keyboard scan, serial I/O, and timers.
- **PIA** — peripheral interface adapter (6520). Joystick ports, cassette motor, console keys.
- **`.xex`** — Atari executable format. Segmented load: header + (start, end, bytes) records.
- **`.atr`** — Atari disk image. 16-byte header plus sector data.
- **Altirra** — Avery Lee's cycle-exact Atari emulator. A wasm build of its core powers the emulator panel (`altirra-wasm`).

## NES

- **NES** — Nintendo Entertainment System (NTSC target). Ricoh 2A03 CPU (6502 core).
- **PPU** — picture processing unit (2C02). Renders background and sprites; has its own 16 KB VRAM space.
- **OAM** — object attribute memory. The 256-byte sprite attribute table.
- **APU** — audio processing unit, integrated in the 2A03.
- **iNES / `.nes`** — the cartridge image format madside builds and loads.
- **jsnes** — the JavaScript NES emulator backend (`jsnes`).

## Toolchain

- **MADS** — Mad-Assembler (Tomasz Biela), a fast 6502 cross-assembler shipped as a wasm core. Also assembles NES iNES images.
- **`.a65`** — MADS source file extension used in this project.
- **`.asm` / `.inc`** — additional source / include extensions MADS accepts.

## Plugin architecture

- **Workbench Core** — the machine-agnostic shell: services, plugin registry, event bus, command registry.
- **MachinePlugin** — describes target hardware: CPU, memory map, memory spaces, display, audio, input, media formats, hardware config, boot equates.
- **ToolchainPlugin** — wraps an assembler/compiler; `build(input)` produces a binary, source map, labels, and extras.
- **DebugAdapterPlugin** — exposes a generic `DebugTarget` (step, breakpoints, register/flag descriptors, memory reads).
- **PanelPlugin** — an arbitrary UI panel (built-in React component or sandboxed `mount(container, ctx)`).
- **EmulatorPlugin** — wraps a machine emulator backend.
- **Converter (AssetPlugin)** — `convert(input, opts)` turns asset bytes into includable data.
- **FileEditorPlugin** — a visual file editor, surfaced through the panel system.

## Project model

- **Project** — a directory tree stored in IndexedDB: `src/`, `assets/`, `generated/`, `converters/`, `editors/`, and `project.json`.
- **Recipe** — a `{ input, output, converter, options }` entry in `project.json`; the asset pipeline runs it.
- **Snapshot** — a content-addressable copy of the project tree: a `{ path → hash }` tree plus deduplicated blobs. Taken on save and on idle.
- **Source map** — `addrToLoc` + `locToAddr`, parsed from the MADS listing; resolves a source line to an address and back. Keys are full POSIX project paths.

## Forge

- **Radicle** — the peer-to-peer code forge that is the canonical home of this repo (GitHub is a CI-only mirror).
- **Patch** — Radicle's equivalent of a pull request.
- **Issue** — a Radicle issue: signed and replicated peer-to-peer.
