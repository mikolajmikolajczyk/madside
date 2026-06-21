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

- **MADS** — Mad-Assembler (Tomasz Biela), a fast 6502 cross-assembler shipped as a wasm core. Also assembles NES iNES images. Toolchain id `mads`.
- **`.a65`** — MADS source file extension used in this project.
- **`.asm` / `.inc`** — additional source / include extensions MADS accepts.
- **cc65** — the second toolchain (id `cc65`): the cc65 C compiler plus the **ca65** assembler and **ld65** linker for the 6502, shipped as WASI wasm. A `.c` / `.s` project links against a bundled C runtime to a `.nes` (NES) or `.xex` (Atari) image.
- **ca65** — the cc65 macro assembler. Its `.s` sources use `.`-prefixed directives (`.segment`, `.proc`, …).
- **ld65** — the cc65 linker; combines object files against a target config + library into the final ROM.
- **sysroot** — the bundled read-only C runtime + headers for a cc65 target (NES or Atari), mounted into the build VFS so a project sees exactly what links. Selected from the active machine id.
- **clang-format** — the LLVM C/C++ formatter, compiled to wasm and loaded lazily, used to format C sources on save (a project `.clang-format` file wins; otherwise an inline preset).

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
- **VFS** — the virtual file system the build reads through: an ordered list of mounts, each backed by a provider (the project tree, a toolchain sysroot, …). Mounts sharing a prefix merge; earlier mounts shadow later ones on read, and a mount can be read-only.

## Forge

- **GitHub** — the canonical home of this repo: source, issues, and pull requests, default branch `main`. (The project was developed on Radicle in its early days.)
- **Pull request (PR)** — the review surface: branch/fork → PR to `main` → CI must pass before merge.
- **Issue** — a GitHub issue; the roadmap is the set of issues grouped by milestone.
