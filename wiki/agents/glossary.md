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

## Sega Genesis terms

- **Sega Mega Drive / Genesis** — 16-bit console. Motorola 68000 main CPU (~7.67 MHz) over a 24-bit bus + a Z80 sound CPU. Machine id `genesis`.
- **Motorola 68000 (m68000)** — 32-bit CISC CPU: eight 32-bit data registers (D0–D7), eight address registers (A0–A7, A7=SP), 24-bit PC, 16-bit status register (SR) with the X N Z V C flags. Big-endian.
- **VDP** — Video Display Processor (Yamaha YM7101). Tile/sprite video. Its memories are reachable only through its data/control ports — surfaced as named spaces `vram` (64 KB tiles/maps/sprites), `cram` (palette, 64 entries), `vsram` (vertical scroll).
- **YM2612** — 6-channel FM synth (main music). **SN76489 (PSG)** — 3 square + 1 noise channel.
- **clownassembler** — Clownacy's M68000 assembler (asm68k / SN-68k syntax, AGPLv3+). `clownassembler.wasm` bundled. Emits a flat binary + a listing parsed into labels + a line↔address source map.
- **SEGA header** — the `"SEGA"` console signature at ROM offset `$100`; the 68000 reset vector (initial SSP at `$0`, entry PC at `$4`) sits in the vector table at `$0`–`$FF`.
- **`.bin`** — flat Genesis ROM (also accepts `.md` / `.gen`; `.smd` is the interleaved dump format, de-interleaved on load).
- **Genesis Plus GX (gpgx)** — Eke-Eke's full-system Mega Drive emulator (non-commercial). `genesis-gpgx.wasm` is the run/display backend; it embeds Musashi as its 68000 core, so `debug-m68k` reads its CPU state directly.
- **Musashi** — Karl Stenerud's portable M68000 interpreter core. madside uses it only as the CPU inside gpgx (the standalone bare-Musashi backend was removed once gpgx shipped).

## Plugin architecture terms

> Defined in [`../adr/0001-plugin-based-workbench.md`](../adr/0001-plugin-based-workbench.md). Per-kind contracts live under [`../plugin-api/`](../plugin-api/).

- **Workbench Core** — machine-agnostic shell. ✅ Services + Plugin Registry + Event Bus + Command Registry (M3, v0.3.0).
- **MachinePlugin** — describes hardware (CPU, memory map, display, audio, input, media formats, hardware config, boot equates). ✅ contract `@ports/plugin-machine`; first impl `@plugins/machine-atari-xl` (v0.4.0).
- **ToolchainPlugin** — `build(input) → ToolchainBuildOutput{binary,sourceMap,labels,extras,...}`. Wraps an assembler/compiler. ✅ contract `@ports/plugin-toolchain`; first impl `@plugins/toolchain-mads`; manifest-driven dispatch via `ToolchainResolverFn` (v0.5.0).
- **DebugAdapterPlugin** — generic `DebugTarget` interface (step / BP / register + flag descriptors / memory). ✅ contract `@ports/plugin-debug`; first impl `@plugins/debug-atari-6502` reusing shared MOS 6502 descriptor tables; `DebugService.target()` exposes live target (v0.6.0).
- **PanelPlugin** — arbitrary UI panel. Tagged union of React `Component` (built-ins) vs vanilla `mount(container, ctx)` (Phase 11-style sandboxed). ✅ contract `@ports/plugin-panel`; built-in `panel-registers` / `panel-memory` / `panel-output` (v0.7.0).
- **EmulatorPlugin** — wraps a machine emulator. ⏳ EmuBackend lives at `@adapters/emu` until contract lands (M4 follow-up).
- **AssetPlugin (converter)** — `convert(input, opts) → bytes`. ✅ Phase 7, exposed via AssetPipelineService.
- **FileEditorPlugin** — Phase 11 contract; folded into `PanelPlugin` via `editorToPanel` bridge (v0.7.0 6f2dc20). Phase 11 modules keep working unchanged.

## v0.7.0 contract types

- **DebugTarget** — bound to a single `RunBackend`. Exposes `registers` + `flags` descriptor tables, `readRegisters()` / `readFlags()`, `step()` / `stepFrame()`, `setBreakpoints()`, `readMemory()` / `writeMemory()`, `getPC()`, `isAtInstrBoundary()`.
- **RegisterDescriptor / FlagDescriptor** — `{ id, label, width? }`. The shared `MOS6502_REGISTERS` + `MOS6502_FLAGS` ship in `@plugins/debug-atari-6502`; NES adapter reuses them verbatim at M9.
- **PanelContext** — `events`, `commands`, `debug`, `project`, `machine`, `data` (free-form host state slot), optional `file` (for editor-mode panels).
- **ProjectManifestV2** — `{ version: 2, name, main, machine, toolchain, emulator?, debugAdapter?, panels?, run?, recipes?, editors? }`. Validated by `parseProjectManifest`; v1 rejected with actionable error.

## SourceMap

`SourceMap = { addrToLoc, locToAddr }`. Keys are **full POSIX project paths** post-`20980c5`. Earlier basename keys collided when projects had `src/foo.a65` and `lib/foo.a65`; the parser now walks `icl` directives in the parent file to reconstruct full paths.

## Project model terms

- **Project** — directory tree under IDB: `src/`, `assets/`, `generated/`, `converters/`, `editors/`, `project.json`.
- **Recipe** — `{ input, output, converter, options }` entry in `project.json`. Asset pipeline runs it.
- **Snapshot** — content-addressable copy of project tree, stored as JSON tree `{ path → hash }` + deduped blobs. Auto on Ctrl+S and 30 s idle.
- **Source map** — `addrToLoc` + `locToAddr` maps parsed from MADS `.lst`. Resolves source line ↔ address.

## Workflow terms

- **GitHub** — the canonical forge: source, issues, and PRs, default branch `main`. (Repo `mikolajmikolajczyk/madside`. The project was developed on Radicle in its early days.)
- **PR (pull request)** — the review surface. Branch/fork → PR to `main` → CI must pass before merge. Links the issue it closes with `Closes #<n>`.
- **Issue** — a GitHub issue. Labels follow the conventions in [`working-on-issues.md`](working-on-issues.md).
- **Epic** — issue labeled `epic`. Children link via `parent:#<n>`.
- **Milestone** — label `milestone:<name>`. Groups issues into work batches.
