# ADR-0001: Plugin-based retro-development workbench

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** architecture, vision, plugin-system

## Context

madside started as an in-browser Atari 8-bit IDE — MADS, Altirra wasm, source-level debugger, asset pipeline. The implementation is heavily Atari-specific: screen dims, sample rate, KBCODE table, kernel ROM, `atari.a65` equates, MADS source-map prefix, and direct `EmuBackend` calls from UI components.

That scope is too narrow. Retro development covers many platforms (C64, NES, fantasy consoles, custom hardware) with the same workflow: edit → assemble/compile → run → debug → inspect memory. Reinventing the IDE per platform wastes effort. The interesting product is the **workbench**, not the Atari implementation.

## Decision drivers

- Same editor, debugger UX, memory view, asset pipeline, project model should work for any 8/16-bit machine.
- Hardware-specific behavior is real and must be expressible without polluting the core.
- Plugin authors should be able to add new machines / toolchains / panels without touching workbench code.
- Solo dev: must stay shippable at every step. No multi-month rewrite.

## Decision outcome

Reframe madside as a **plugin-based retro-development workbench**. Name stays "madside" for now; design must allow rename without architectural shift.

### Layered architecture

```
Workbench Core
├── Plugin Registry      — discovery + lifecycle
├── Event Bus            — pub/sub across services
├── Command Registry     — palette, hotkeys, programmatic dispatch
├── Project System       — manifest, file tree, storage
├── Layout Manager       — panels, splitters
├── Build Service        — delegates to ToolchainPlugin
├── Run Service          — delegates to EmulatorPlugin
├── Debug Service        — delegates to DebugAdapter
├── Memory Service       — generic R/W over DebugTarget
├── Symbol Service       — generic symbol lookup
└── Asset Pipeline       — converters per project (existing)
```

**Hard rule:** UI talks to services. Services talk to plugins. UI never imports a plugin or hardware-specific module.

### Plugin taxonomy

- **MachinePlugin** — describes hardware (CPU, memory map, devices, screen dims, sample rate, input layout, default panels).
- **ToolchainPlugin** — `build(project) → BuildResult`. MADS, ca65, KickAssembler, …
- **EmulatorPlugin** — `createInstance(MachineConfig) → EmulatorInstance` with `loadBinary/run/pause/reset/step`. Altirra wasm, VICE wasm, JS NES emu, …
- **DebugAdapter** — generic `DebugTarget` interface (`stepInstruction`, `setBreakpoint`, `getRegisters`, `readMemory`). Debug UI machine-agnostic.
- **PanelPlugin** — arbitrary UI panel that may depend on a `MachinePlugin` capability. Memory viewer, register viewer, ANTIC/GTIA/PPU/VIC-II viewers, tile editor, sprite editor.
- **AssetPlugin** — `convert(input, opts) → bytes`. Already implemented in Phase 7; bring under unified registry.
- **FileEditorPlugin** — Phase 11 contract; generalize to fit `PanelPlugin` model.

### Project manifest v2

`project.json` gains hardware/tooling selection:

```jsonc
{
  "version": 2,
  "name": "demo",
  "machine": "atari-xl",
  "toolchain": "mads",
  "emulator": "altirra-wasm",
  "debugAdapter": "atari-6502-debug",
  "panels": ["memory", "registers", "antic", "symbols"],
  "main": "src/main.asm",
  "run": { "default": { "audio": true } },
  "recipes": [ /* unchanged */ ],
  "editors": { /* unchanged */ }
}
```

Hard cut. No back-compat shim — no external users yet.

### Naming discipline

Service names are domain-generic. Examples:

- `BuildService`, `RunService`, `DebugService` — yes.
- `AtariService`, `MadsService`, `AltirraPanel` — never.

Atari-specific code lives only in `plugins/machine-atari-xl/`, `plugins/toolchain-mads/`, `plugins/emulator-altirra/`, `plugins/debugger-atari-6502/`. Workbench treats them as opaque.

### Repository layout

Single Vite app stays the canonical layout. The M8 monorepo split (`packages/core`, `packages/plugin-api`, `packages/workbench`, `packages/plugins/*`) was **cancelled 2026-06-12** — see [`wiki/decisions/2026-06-12-monorepo-split-cancelled.md`](../decisions/2026-06-12-monorepo-split-cancelled.md). Built-ins stay under `src/plugins/`; third-party plugins ship from their own repos and load via the PluginRegistry Blob URL loader (the same path used today for project-local converters and editors).

Rationale: solo project, no external plugin authors queued. ADR-0002 + `eslint-plugin-boundaries` already enforce the layering property the split was meant to deliver, at zero infrastructure cost. Revisit only when a concrete external author exists.

### Validation milestone

M9 ships a second machine (NES end-to-end) with **zero workbench changes** beyond an additive contract evolution. If the M3–M8 work is right, that's a packaging exercise. If it isn't, M9 surfaces every leaked Atari assumption.

NES chosen over C64 because: simpler memory map, PPU is a clean foil to ANTIC/GTIA (forces the panel-plugin abstraction).

> **Outcome (v0.8.0, 2026-06-13):** shipped as predicted, with two course-corrections recorded in [`../decisions/2026-06-13-nes-uses-mads-and-named-memory-spaces.md`](../decisions/2026-06-13-nes-uses-mads-and-named-memory-spaces.md):
> - **Toolchain: MADS, not ca65.** The NES CPU is a 6502 and MADS already assembles raw NROM iNES images directly, so no second toolchain was needed to validate the abstraction. ca65/ld65 stays in the backlog as a future C/neslib target.
> - **Emulator: jsnes** (the JS NES emu, as sketched), via the `RunBackend` de-facto contract (`EmulatorPlugin` port still pending).
> - **One additive contract change**, not zero: `MachinePlugin.memorySpaces` + a `space?` param on memory reads, so the PPU/OAM address spaces are debuggable. This is the universal mechanism for any machine with off-CPU-bus state.

## Considered options

1. **Keep Atari-only IDE.** Faster ship, narrower audience, unmaintainable when a second machine is wanted.
2. **Hardcode multi-machine via `if (machine === "atari")` branches.** Short-term cheap, calcifies fast, makes plugin authors second-class citizens.
3. **Plugin-based workbench (chosen).** Up-front refactor cost, pays back with every new machine, toolchain, or panel.

## Positive consequences

- Adding a machine = ship a plugin, not a fork.
- Atari implementation becomes a reference for plugin authors.
- Testing surface clarifies: each plugin is testable against its interface.
- Future hardware experiments (fantasy consoles, custom CPUs) become a plugin, not a project.

## Negative consequences

- Refactor cost across M3–M7 before any user-visible new feature (M8 was cancelled; see decision log).
- Plugin contracts ossify once published; first design needs care.
- Single-process Vite app limits isolation — a misbehaving plugin can crash the workbench. Acceptable for solo / trusted-plugin era.

## Open questions

- **Testing strategy** — resolved by ADR-0005 (Foundation): contract + headless integration hybrid (Vitest).
- **Plugin discovery / registry** beyond per-project `converters/` and `editors/` folders. Marketplace deferred; address when external authors exist.
- **Event Bus implementation** — resolved by `9ab1bc2` (M3): hand-rolled ~50 LOC typed pub/sub at `@services/event-bus`.
- **Hot reload** for plugins. Nice-to-have, not required for M3.

## Documentation convention

Internal/agent-facing project notes live under [`wiki/`](../index.md) — ADRs (`wiki/adr/`, append-only + numbered), conventions, plugin-api contracts, skills. The **public** documentation is a separate Astro Starlight site under `docs/` (its own workspace), authored in `docs/src/content/docs/` and published to `/docs/` on the hosted site (epic `de964f7`). The old `wiki/user/` placeholder is retired.

## Links

- Roadmap and per-milestone child issues tracked in Radicle (epic-labeled issues). *(Update 2026-06: canonical forge moved to GitHub — the roadmap now lives in GitHub issues.)*
- Prior asset-pipeline plugin contract: Phase 7 in `CLAUDE.md` (will be superseded by this ADR + child documents).
- Prior file-editor plugin contract: Phase 11 in `CLAUDE.md` (will generalize into `PanelPlugin`).
