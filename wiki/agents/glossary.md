# Glossary

## Atari 8-bit terms

- **Atari XL/XE** — 8-bit home computer family (800XL, 130XE). 6502 CPU at ~1.79 MHz. Target hardware for the current Atari implementation.
- **ANTIC** — display list processor. Reads display lists from RAM, drives raster fetch, generates display interrupts. Custom chip.
- **GTIA** — graphics translator. Converts ANTIC pixel data + sprite data to NTSC/PAL video. Palette chip.
- **POKEY** — pot keyboard. Audio (4 channels, programmable noise via LFSRs), keyboard scan, serial I/O, timers.
- **PIA** — peripheral interface adapter (6520). Joystick ports + cassette motor + console keys.
- **KBCODE** — POKEY's keyboard scan-code register. JS keyboard events translated to KBCODE values via a table cribbed from Altirra.
- **`.xex`** — Atari executable format. Segmented load: header + (start, end, bytes)*. Optional DOSVEC stub for autorun.
- **`.atr`** — Atari disk image. 16-byte header + sector data.
- **MADS** — Mad Assembler (Tomasz Biela). Fast, modern 6502 cross-assembler. Source: `mads.wasm` bundled in repo.
- **`.a65`** — MADS source file extension used in this project.
- **`.lst`** — MADS listing file. Per-line address + emitted bytes. Used to build source map.
- **`.lab`** — MADS label dump. `symbol → addr` table. Used for autocomplete + future symbol panel.
- **Altirra** — Avery Lee's cycle-exact Atari emulator. The wasm core powers our emulator panel.

## Plugin architecture terms

> Defined in [`../adr/0001-plugin-based-workbench.md`](../adr/0001-plugin-based-workbench.md). State noted per term.

- **Workbench Core** — machine-agnostic shell. ✅ Services + Plugin Registry + Event Bus + Command Registry (M3, v0.3.0).
- **MachinePlugin** — describes hardware (CPU, memory map, display, audio, input, media formats, hardware config, boot equates). ✅ contract `@ports/plugin-machine`; first impl `@plugins/machine-atari-xl` (v0.4.0).
- **ToolchainPlugin** — `build(input) → ToolchainBuildOutput{binary,sourceMap,extras,...}`. Wraps an assembler/compiler. ✅ contract `@ports/plugin-toolchain`; first impl `@plugins/toolchain-mads` (v0.5.0).
- **EmulatorPlugin** — wraps a machine emulator. ⏳ EmuBackend lives at `@adapters/emu` until contract lands (M4 follow-up).
- **DebugAdapter** — generic `DebugTarget` interface (step/BP/registers/memory). ⏳ M6 (v0.6.0, e50d1b8).
- **PanelPlugin** — arbitrary UI panel. ⏳ M7 (v0.7.0, 3000c0e).
- **AssetPlugin (converter)** — `convert(input, opts) → bytes`. ✅ Phase 7, exposed via AssetPipelineService.
- **FileEditorPlugin** — Phase 11 contract; generalizes into `PanelPlugin` in M7 (cae0633).

## Project model terms

- **Project** — directory tree under IDB: `src/`, `assets/`, `generated/`, `converters/`, `editors/`, `project.json`.
- **Recipe** — `{ input, output, converter, options }` entry in `project.json`. Asset pipeline runs it.
- **Snapshot** — content-addressable copy of project tree, stored as JSON tree `{ path → hash }` + deduped blobs. Auto on Ctrl+S and 30 s idle.
- **Source map** — `addrToLoc` + `locToAddr` maps parsed from MADS `.lst`. Resolves source line ↔ address.

## Workflow terms

- **Radicle** — peer-to-peer code forge. Canonical home of this repo (GitHub is a CI-only mirror).
- **Patch** — Radicle's pull request. Created by `git push rad HEAD:refs/patches`.
- **Issue (Radicle)** — like GitHub issue, but signed and replicated peer-to-peer. Labels follow [`../skills/radboard.md`](../skills/radboard.md).
- **Epic** — issue labeled `epic`. Children link via `parent:<hex7>`.
- **Milestone** — label `milestone:<name>`. Groups issues into work batches.
