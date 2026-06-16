# Architecture (current state)

> Layered layout from [ADR-0002](../adr/0002-layering.md). The workbench has every plugin contract the Atari path needs — MachinePlugin (v0.4.0), ToolchainPlugin (v0.5.0), DebugAdapter (v0.6.0), PanelPlugin (v0.7.0), Service↔UI sync FSM (v0.7.5, ADR-0007) — plus manifest-driven dispatch, contract test harnesses, and a path-aware source map. Shipped since: NES validation (v0.8.0 — machine-nes + jsnes backend + panel-ppu + named memory spaces), Templates (v0.8.5), editor-language generalization (v0.8.7 — CPU opcodes from `@core/cpu` + per-toolchain `ToolchainLanguage`), visual manifest editor + `build.args` + Astro docs site (v0.9.0), and Courses including the declarative check runner (v0.9.5 — only the course-authoring docs child still open). M8 monorepo split was cancelled 2026-06-12 — see [decisions](../decisions/2026-06-12-monorepo-split-cancelled.md). Active issues in GitHub (`gh issue list`).

## Repo shape (ADR-0002 layout)

```
src/
  main.tsx               # Vite entry; renders @ui/App into #root

  core/                  # pure utilities, zero side effects
    hash.ts              # sha256 over Uint8Array / string
    path.ts              # basename / dirname / extOf
    hex.ts               # number → hex formatting / parsing
    mads-tokens.ts       # MADS directive set (MADS_DIRECTIVES) + LabelInfo shape (shared @ui + @app)
    cpu/                 # CPU instruction vocabularies, resolved by MachinePlugin.cpu (epic 78b12bf)
      mos6502.ts         # MOS6502 CpuLanguage — opcodes Set + opcodeDocs (drives editor highlight/hover)
      index.ts           # getCpuLanguage(cpuId) registry — mos6502 + ricoh-2a03 (NES 2A03) → MOS6502

  ports/                 # interfaces only (impls in @adapters/@plugins)
    index.ts
    errors.ts            # WorkbenchError hierarchy + Result<T, E> + ManifestError (ADR-0004)
    logger.ts            # Logger
    event-bus.ts         # EventBus + WorkbenchEvents declaration-merging map
    command-registry.ts  # CommandRegistry
    plugin-registry.ts   # PluginRegistry (kinds: machine|toolchain|debug-adapter|panel|emulator|converter|editor)
    storage.ts           # StorageBackend port (projects/snapshots/breakpoints/courses/kv) + domain types
    project-manifest.ts  # ProjectManifestV2 + parseProjectManifest validator (v1 hard-cut)
    source-map.ts        # SourceMap shared between toolchain plugins + UI
    plugin-machine.ts    # MachinePlugin contract (v0.4.0)
    plugin-toolchain.ts  # ToolchainPlugin contract (v0.5.0)
    plugin-debug.ts      # DebugAdapterPlugin + DebugTarget + RegisterDescriptor / FlagDescriptor (v0.6.0)
    plugin-panel.ts      # PanelPlugin tagged union (React Component | vanilla mount) + PanelContext (v0.7.0)
    plugin-emulator.ts   # EmulatorPlugin contract — createBackend(): RunBackend
    plugin-converter.ts  # ConverterModule (Phase 7)
    plugin-editor.ts     # EditorModule (Phase 11 — folded into PanelPlugin via editorToPanel)
    cpu.ts               # Cpu6502State — shared 6502 register snapshot
    services/            # Build/Run/Debug/AssetPipeline contracts
    test/                # assert<Kind>Plugin harnesses for external authors (Toolchain + Emulator ✅)

  services/              # workbench-core services (impl)
    index.ts
    event-bus.ts         # createEventBus() — typed pub/sub, hand-rolled, ~50 LOC
    command-registry.ts  # createCommandRegistry() — id-keyed Map + when() gate
    plugin-registry.ts   # createPluginRegistry() — per-kind Map; project shadows builtin
    build-service.ts     # createBuildService() — manifest.toolchain id → ToolchainResolverFn → plugin.build → events
    run-service.ts       # createRunService() — emulator lifecycle + audio; backend factory + MachineMedia DI'd
    debug-service.ts     # createDebugService() — delegates to active DebugAdapter via target()
    asset-pipeline-service.ts # createAssetPipelineService() — runAll / runOne / runAffected (skip-aware)

  adapters/              # port implementations (machine-/toolchain-agnostic only)
    plugin-loader.ts     # Blob URL + dynamic import + sha256 cache
    storage-idb/         # IDB schema v3 (projects/files/meta/snapshots/blobs/breakpoints/courses)
                         #   + createIdbStorage() — @ports.StorageBackend impl
                         #   + parseProjectManifest at load (rejects v1)
    storage-memory/      # createMemoryStorage() — StorageBackend (tests, future CLI)
    logger/              # Console / Buffered / Noop logger adapters
    emu/                 # EmuBackend (Altirra-internal) + AltirraBackend + altirraEmulator EmulatorPlugin
                         #   wasm/altirra-core.{js,wasm}  — Altirra core (~134 KB js + ~4.6 MB wasm), Vite-tracked
                         #   altirra.ts loads it via `import createAltirraCore from "./wasm/altirra-core.js"` + `./wasm/altirra-core.wasm?url`

  plugins/               # built-in plugin instances
    converters/          # asset converters (Phase 7)
    editors/             # plugin file editors (Phase 11) + editorToPanel bridge
    machine-atari-xl/    # MachinePlugin v0.4.0 — display/audio/input/memoryMap/media{xex,atr,car,cas}/hardwareConfig/bootEquates
    machine-nes/         # MachinePlugin (v0.8.0) — NES; cpu ricoh-2a03, memorySpaces [ppu (PPU VRAM 0x4000), oam (0x100)], devices ppu/apu; pairs with jsnes backend
    toolchain-mads/      # ToolchainPlugin v0.5.0
      mads.ts            # plugin wrapper (parses .lab → labels Map, .lst → SourceMap with path-aware reconstruction)
      wasm-mads/         # MADS WASI runner + .lst sourceMap + .lab parser (private)
    debug-atari-6502/    # DebugAdapter v0.6.0 — wraps AltirraBackend; exports MOS6502_REGISTERS/FLAGS (reused for NES — both setups share this adapter)
    emulator-nes-jsnes/  # RunBackend (v0.8.0) over the jsnes npm package; readMem(addr,len,space) serves cpu/ppu/oam; lazy-imported (code-split)
    panel-registers/     # PanelPlugin v0.7.0 — descriptor-driven register + flag panel
    panel-memory/        # PanelPlugin v0.7.0 — hex view + base input + cursor follow badge
    panel-output/        # PanelPlugin v0.7.0 — build stdout/stderr + OK/ERR tag
    panel-ppu/           # PanelPlugin (v0.8.0) — NES PPU pattern tables + palette; supports() gated on the 'ppu' memory space

  app/                   # workbench wiring + non-React state
    createWorkbench.ts   # headless factory (DOM-free, test-friendly) — registers every built-in plugin under unified PluginRegistry
    workbench-context.tsx # React provider + useWorkbench() — wires IDB / console adapters
    plugin-registry-glue.ts # supervised re-exports of @plugins helpers for @ui
    state/store.ts       # useProject() — files, activeName, updateActive
    fileTemplates.ts     # seed text for "new file" of each known ext
    templates.ts         # bundled-template glob loader (v0.8.5 — project templates)
    courses.ts           # bundled-course glob loader + CourseService (v0.9.5)
    course-project.ts    # lesson → persistent project (stamps manifest.course)
    check-runner.ts      # declarative check evaluator + orchestrator — build/label/register/memory checks (v0.9.5)
    labels.ts            # MADS label / equate / token registry

  ui/                    # React tree + react-bound hooks + assets
    App.tsx              # root; owns cpu / bp lines / source map / polling; renders Debug as slot host
    App.css / tokens.css / index.css
    components/
      layout/{MenuBar,DebugBar,StatusBar,Splitter}.tsx
      project/{Explorer,FileTree}.tsx
      editor/{Editor,PluginEditor,PluginEditorErrorBoundary}.tsx
      debug/{Emulator,Debug}.tsx  # Debug is a slot host — no panel-specific JSX
      asset/AssetPanel.tsx
      history/HistoryDialog.tsx
      course/CoursePanel.tsx      # lazy lesson panel (react-markdown), shown when manifest.course is set
      manifest/ManifestEditor.tsx # visual project.json form + raw editor (v0.9.0)
      ui/                # Radix wrappers + reusable Dialog/Menu/Tooltip atoms
      PanelSlot.tsx      # routes between PanelPlugin.Component and PanelPlugin.mount paths
    hooks/
      useActiveMachine.ts useAutoAssemble.ts useBreakpointAddrs.ts useCursorMemory.ts
      useDebuggerShortcuts.ts usePluginEditor.ts useProjectLabels.ts
      useRunStatus.ts useSplitterWidth.ts
    codemirror/          # CodeMirror StreamLanguage definitions
      assemblyLang.ts    # buildAssemblyLanguage(cpu, toolchainLanguage) — generic, CPU+toolchain driven (epic 78b12bf; replaced madsLang.ts)
      jsConverterLang.ts
    assets/              # static assets (hero.png, svgs)

public/
  wasm/mads.wasm                  # MADS FPC → wasm32-wasip1 (1.9 MB) — the ONLY wasm in public/
  favicon.svg / icons.svg
# Note: the Altirra core does NOT live in public/. It is at src/adapters/emu/wasm/altirra-core.{js,wasm}
# and pulled in via a Vite URL import (see emu/ above). NES uses the `jsnes` npm package — no local wasm.
_notes/altirra/                   # Fork sibling: mikolajmikolajczyk/AltirraSDL, branch madside-embed
wiki/                             # All project documentation
```

Path aliases follow the layer table — `@core/...`, `@ports/...`, `@adapters/...`, `@services/...`, `@plugins/...`, `@app/...`, `@ui/...`. Defined in `tsconfig.base.json` and mirrored in `vite.config.ts` + `vitest.config.ts`. Enforced by `eslint-plugin-boundaries` (commit `01c77ab`).

TypeScript uses **project references**: one tsconfig per layer, root `tsconfig.json` references them all. `tsc -b` builds incrementally; only changed layers recompile. Mirrors the ADR-0002 dependency graph.

- `tsconfig.base.json` — shared compilerOptions + path aliases
- `tsconfig.core.json` / `ports.json` / `adapters.json` / `services.json` / `plugins.json` / `app.json` / `ui.json` — per layer
- `tsconfig.node.json` — Vite config sources
- Root `tsconfig.json` — references all of the above

## Data flow (current)

1. User edits in `Editor` → `updateActive(content)` updates `files` in store.
2. **Auto-assemble:** `useAutoAssemble` debounces 400 ms on `files` change → `BuildService.build({ projectId, files, manifest })`. Ctrl/Cmd+S = force-now. Race guard inside the hook.
3. `BuildService` resolves `manifest.toolchain` id via `ToolchainResolverFn` (default: PluginRegistry lookup). MADS plugin writes files into `PreopenDirectory`, runs `mads.wasm` via WASI, reads `<main>.xex`/`.lst`/`.lab` back. Plugin parses `.lst` into a path-aware `SourceMap` (`20980c5` walks icl directives so `src/main.a65` + `lib/main.a65` resolve independently) + `.lab` into `Map<string, number>` labels.
4. `BuildResult` flows back through `useAutoAssemble`. UI subscribes to `'build:done'` / `'build:error'` via `EventBus`; panel-output re-renders on its own.
5. **Run is separate from assemble.** `onRun` commits the binary to `loadedXex`; `Emulator` calls `RunService.load(binary)` which dispatches through `MachineMedia.detect(bytes)` → `EmuBackend.loadMedia(format, bytes)`. Altirra core advances 60 Hz `advanceFrame`; trap = PC in BP addr set. On hit → pause + `debug:bp-hit` event. Audio: AudioWorklet driven by Altirra POKEY tap.
6. **Step** advances exactly one instruction via `DebugService.step()` → `DebugAdapter.step()` → Altirra `dbg->StepInto` + walk `Advance(false)` until `Stopped`. Emits `'debug:step-done'`.
7. **Panels self-fetch** on the events above (`806766d`). `panel-registers` + `panel-memory` subscribe to `debug:step-done` / `debug:bp-hit` / `run:state` and pull fresh data through `DebugService`. No prop drilling.

## Keyboard shortcuts (web-IDE convention)

| Key | Action |
|-----|--------|
| Ctrl+Enter | Run |
| Ctrl+Shift+Enter | Restart |
| Ctrl+. | Pause |
| Ctrl+Shift+. | Stop |
| Ctrl+S | Save + assemble + snapshot |
| Ctrl+B / Ctrl+Shift+B | Build |
| F9 | Toggle breakpoint at cursor |
| F10 | Step instruction |
| F11 | Step frame |

The browser-reload family (F5 / Ctrl+R / Shift+F5 / Ctrl+Shift+F5 / Ctrl+Shift+R / Ctrl+P) is intentionally **not** bound — silent collision with browser reload caused commit `701373a`'s regression where every "refresh" silently triggered Run.

## Component map: what owns what

- **`App.tsx`** — root state glue. Owns: `files`, `cpu`, `bp lines per file`, `sourceMap`, polling, tab routing. Renders `Debug` as a slot host; renders `panel-output` as a fixed slot above the editor.
- **`Emulator.tsx`** — canvas + frame loop. Reads `machine.display` dims + `pixelFormat`. Drives `RunService`; emits `debug:bp-hit` on trap.
- **`Debug.tsx`** — pure slot host. Iterates `manifest.panels` → `machine.defaultPanels` → fallback `['registers', 'memory']` and renders `<PanelSlot>` per id. Zero panel-specific JSX.
- **`PanelSlot`** — closes a `PanelContext` over the workbench services + project + data slot. Branches on `panel.Component` (React) vs `panel.mount` (vanilla container). Honours `supports(machine)` gate.
- **`PluginEditor.tsx`** — sandbox host for Phase 11 file editors. Three-layer error containment: sync try/catch + React error boundary + window error/unhandledrejection listeners scoped to the editor lifetime.
- **`useAutoAssemble`** — debounce + race-guard. Dispatches to `BuildService`.
- **`workbench.machine`** — active MachinePlugin, **manifest-driven**. `createWorkbench` holds a `machineSetups` table keyed by machine id (`'atari-xl'` → Altirra backend + atari-6502 adapter; `'nes'` → lazy jsnes backend + reused atari-6502 adapter). `setActiveMachine(manifest.machine)` swaps the active entry and `run.reconfigure(...)`s the backend/media/hardware; UI reads it via `useActiveMachine()` (subscribes through `subscribeMachine`). Defaults to atari-xl until a project manifest names another machine.
- **`workbench.toolchain`** — active ToolchainPlugin (UI introspection; BuildService dispatches manifest-driven independently).
- **`workbench.debug.target()`** — live `DebugTarget` once `RunService.boot()` completes; panels read register/flag descriptors from here.

### Service ↔ UI sync (ADR-0007)

Every domain (run, debug, build, project, file) has one FSM owned by its service; every transition emits exactly one typed `EventBus` event; UI reads via `useSync*` hooks. Run lifecycle is the reference (`useRunStatus()` in `src/ui/hooks/`); never mirror service state in `useState`. See [ADR-0007](../adr/0007-service-ui-sync.md) + `wiki/plugin-api/panel.md`.

## Why these stacks

- **CodeMirror 6** (not Monaco) — 200 KB vs 2 MB+; custom languages via `StreamLanguage`; themes via CSS variables.
- **`@bjorn3/browser_wasi_shim`** (not Wasmer) — tiny, no deps; `PreopenDirectory` + `File` map directly to MADS's plain file I/O; `wasi_snapshot_preview1` only — matches FPC `wasip1` RTL target.
- **Altirra wasm** (over 8bitworkshop) — cycle-exact 6502 + ANTIC + GTIA + POKEY + PIA; debugger primitives (`SetBreakpoint`, `StepInto`); audio tap; save state. Fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed`.

## Emulator interface (v0.6.0)

Two related contracts exist. **`EmuBackend`** (`src/adapters/emu/backend.ts`) is the Altirra-internal interface below (its `CpuRegs` is now an alias of the shared `Cpu6502State`). **`RunBackend`** (`@ports/services/run-service.ts`) is the machine-agnostic backend contract `RunService` consumes and the `EmulatorPlugin.createBackend()` returns (Altirra adapts to it; the jsnes NES backend implements it directly). Named memory spaces live on `RunBackend.readMem(addr, len, space?)` (`space` defaults to the CPU bus; backends throw on unknown spaces) and on `DebugTarget.readMemory(addr, len, space?)`, mirroring `MachinePlugin.memorySpaces`. The legacy `EmuBackend.readMem` shown below is still the plain `(addr, len)` form.

```ts
interface EmuBackend {
  init(): Promise<void>
  reset(): void
  // Generic media load — format id sourced from MachinePlugin.media.formats.
  loadMedia(format: string, bytes: Uint8Array): void
  advanceFrame(trap?: TrapFn): number
  step(): number
  cpuState(): CpuRegs
  readMem(addr: number, len: number): Uint8Array
  writeMem(addr: number, bytes: Uint8Array): void
  connectVideo(pixels: Uint32Array): void
  connectAudio(sink: SampledAudioSink): void   // AudioWorklet-backed
  sendKey(code: number, down: boolean): void   // codeToKey from MachinePlugin.input
  // Hardware-config setters forwarded from MachinePlugin.hardwareConfig.
  setHardwareMode(mode: number): void
  setMemoryMode(mode: number): void
  setBasic(enabled: boolean): void
  setKernel(id: number): void
  saveState(): unknown
  loadState(s: unknown): void
  setBreakpoints(addrs: Set<number>): void
  width: number; height: number; sampleRate: number
}
```

`frameRefresh` dropped in `61414f2` — broken contract (snapshot/restore left sim inconsistent); per-step refresh research lives in backlog `c309619` and will land under a new typed method when something works.

Implementations: `AltirraBackend` (Atari) and `JsnesBackend` (NES, `@plugins/emulator-nes-jsnes`, over the `jsnes` npm package). `EightBitWorkshopBackend` removed Phase 12. The **`EmulatorPlugin` port** (`@ports/plugin-emulator.ts`, `createBackend(): RunBackend`) now formalizes the backend contract: `altirraEmulator` (in `@adapters/emu`) and `jsnesEmulator` register on the PluginRegistry, and `createWorkbench` resolves the backend from the machine's `compatibleEmulators` (debug adapters resolve the same way via `compatibleDebugAdapters`). `RunBackend` itself stays the per-frame surface `RunService` drives — including `startAudio`/`suspendAudio`.

## Storage (IDB)

```
db: madside, version: 2  (shape: src/adapters/storage-idb/schema.ts; row types: ./types.ts)
stores:
  projects    { id, name, createdAt, updatedAt }                 key: id;             index: byUpdatedAt
  files       { projectId, path, content (Uint8Array), updatedAt } key: [projectId, path]; index: byProject
  meta        { key, value }                                     key: key
  snapshots   { id, projectId, ts, summary, tree }               key: id;             index: byProject
  blobs       { hash, data: Uint8Array }                         key: hash (sha-256 hex) — content-addressed dedup
  breakpoints { projectId, bps: Record<path, number[]>, updatedAt } key: projectId
```

Path-based files (binary + text unified, Phase 11). Snapshots = tree `{ path → contentHash }` + manifest copy. Deduped via blobs (SHA-256 from `@core/hash`).

`createIdbStorage()` implements `@ports.StorageBackend` (projects/snapshots/breakpoints/courses/kv); `createMemoryStorage()` is the test/CLI adapter, both verified by the `assertStorageBackend` contract harness. On load the IDB adapter runs `parseProjectManifest` and rejects v1 with `'project.json v1 unsupported, recreate project'`.

## Manifest (`project.json`)

v2 shipped in M5 (`443eaed`). Validated by `parseProjectManifest` in `@ports/project-manifest`. Required: `version: 2`, `name`, `main`, `machine` id, `toolchain` id. Optional: `emulator`, `debugAdapter`, `panels[]`, `run`, `recipes[]`, `editors{}`, `build{ args[] }` (raw toolchain-specific assembler flags, v0.9.0), `course{ id, lesson }` (set when instantiated from a course lesson — drives course mode / the lesson panel). Hard cut from v1 — no shim. v1 manifests trigger `ManifestError`.

`BuildService` dispatches by `manifest.toolchain` id via a `ToolchainResolverFn` backed by `PluginRegistry`. Adding a new assembler (e.g. ca65) is a `register()` call away.

## Plugin contracts (current)

| Contract | Port | First impl | Status |
|----------|------|-----------|--------|
| **MachinePlugin** | `@ports/plugin-machine` | `@plugins/machine-atari-xl` | v0.4.0 ✅ (+ `@plugins/machine-nes`, v0.8.0; `memorySpaces` declares extra address spaces — NES `ppu`/`oam`) |
| **ToolchainPlugin** | `@ports/plugin-toolchain` | `@plugins/toolchain-mads` | v0.5.0 ✅ (manifest-driven dispatch via `ToolchainResolverFn`; optional `language?: ToolchainLanguage` — directives/comments/snippets — paired with CPU opcodes to drive the editor, v0.8.7) |
| **DebugAdapterPlugin** | `@ports/plugin-debug` | `@plugins/debug-atari-6502` | v0.6.0 ✅ (`DebugService.target()` returns live `DebugTarget`; the atari-6502 adapter is reused for NES) |
| **PanelPlugin** | `@ports/plugin-panel` | `@plugins/panel-registers/memory/output` | v0.7.0 ✅ (React + vanilla mount union; FileEditor folded via `editorToPanel`; + `@plugins/panel-ppu`, v0.8.0 — `supports()` gated on the `ppu` memory space) |
| **ConverterModule** | `@ports/plugin-converter` | `@plugins/converters/*` | Phase 7 ✅ |
| **EditorModule** | `@ports/plugin-editor` | `@plugins/editors/*` | Phase 11 ✅, bridge to PanelPlugin shipped in `6f2dc20` |
| **EmulatorPlugin** | `@ports/plugin-emulator.ts` | `altirraEmulator` (`@adapters/emu`), `jsnesEmulator` (`@plugins/emulator-nes-jsnes`) | `createBackend(): RunBackend`; resolved from the machine's `compatibleEmulators` via the PluginRegistry. `assertEmulatorPlugin` harness. |

External authors get an `assert<Kind>Plugin(impl, fixture)` Vitest harness under `@ports/test/` (Toolchain shipped in `51e047c`; Machine has a drift contract test, full harness pending).

## Cross-cutting cleanup completed

- **M2.5 Foundation**: path aliases, project refs, ESLint boundaries, headless workbench, ProjectRepository port + IDB adapter, ADR-0002 through ADR-0006, pre-commit + madge circular guard, Nix flake.
- **M3 Services**: Build / Run / Debug / AssetPipeline services extracted, EventBus + CommandRegistry + unified PluginRegistry, AssetPipelineService.runAffected.
- **M4 MachinePlugin**: display, audio, input KBCODE, memoryMap, media-format dispatch, hardwareConfig setters, bootEquates, sendKey held-key tracking, AudioWorklet migration, pixel format / RGBA fast path.
- **M5 ToolchainPlugin**: contract + MADS plugin + UI decouple (SourceMap to `@ports`, BuildResult exposes parsed `sourceMap` + `labels`), project.json v2 + manifest-driven dispatch, `assertToolchainPlugin` harness, mads VFS cleanup.
- **M6 DebugAdapter**: `DebugTarget` + `DebugAdapterPlugin` contracts, atari-6502 adapter, descriptor-driven Debug UI, generic MOS 6502 layout reusable for NES, `EmuBackend.frameRefresh` dropped.
- **M7 PanelPlugin**: contract (React + vanilla mount tagged union), three built-in panels, event-driven panel refresh, FileEditor → PanelPlugin generalisation, PluginEditor error containment, memory auto-follow badge, plugin-api docs under `wiki/plugin-api/`.
- **Quality fixes**: shortcut remap off browser-reload keys (`701373a`), path-aware SourceMap (`20980c5`).
- Hooks split from App.tsx (824 → 539 lines).
- Utility dedupe: `sha256Hex`, `basename`, `hex`, `pluginLoader` → single source under `@core`.
- 8bitworkshop backend removed.
