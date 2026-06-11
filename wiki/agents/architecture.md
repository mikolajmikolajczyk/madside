# Architecture (current state)

> Layered layout from [ADR-0002](../adr/0002-layering.md). M2.5 Foundation + M3 Services + M4 MachinePlugin shipped; M5 ToolchainPlugin in flight (ea35144 ToolchainPlugin contract + MADS first plugin landed, 0897b06 project.json v2 next). Active issues in Radicle (`rad issue list`).

## Repo shape (ADR-0002 layout)

```
src/
  main.tsx               # Vite entry; renders @ui/App into #root

  core/                  # pure utilities, zero side effects
    hash.ts              # sha256 over Uint8Array / string
    path.ts              # basename / dirname / extOf
    hex.ts               # number → hex formatting / parsing

  ports/                 # interfaces only (implementations live in @adapters/@plugins)
    index.ts
    errors.ts            # WorkbenchError hierarchy + Result<T, E> helpers (ADR-0004)
    logger.ts            # Logger contract
    event-bus.ts         # EventBus + WorkbenchEvents declaration-merging map
    command-registry.ts  # CommandRegistry (commands, dispatch, shortcuts)
    plugin-registry.ts   # PluginRegistry (kinds, entries, project/builtin shadow)
    project-repository.ts # ProjectRepository + Project / Snapshot models
    source-map.ts        # SourceMap shared between toolchain plugins + UI
    plugin-machine.ts    # MachinePlugin contract (v0.4.0) — display/audio/input/memoryMap/media/hardwareConfig/bootEquates
    plugin-toolchain.ts  # ToolchainPlugin contract (v0.5.0) — build(input) → output{binary,sourceMap,extras}
    services/            # Build/Run/Debug/AssetPipeline contracts

  services/              # workbench-core services (impl)
    index.ts
    event-bus.ts         # createEventBus() — typed pub/sub, hand-rolled, ~50 LOC
                         #   Services emit; UI subscribes via useWorkbench().events.
    command-registry.ts  # createCommandRegistry() — id-keyed Map + when() gate
    plugin-registry.ts   # createPluginRegistry() — per-kind Map; project shadows builtin
    build-service.ts     # createBuildService() — recipe engine → toolchain hook → events; DI'd via @app
    run-service.ts       # createRunService() — emulator lifecycle + audio; backend factory + MachineMedia DI'd
    debug-service.ts     # createDebugService() — step / BP / cpuState / readMem via RunService.backend()
    asset-pipeline-service.ts # createAssetPipelineService() — runAll / runOne / runAffected (skip-aware); emits recipes:start/done

  adapters/              # port implementations (machine-/toolchain-agnostic only)
    plugin-loader.ts     # Blob URL + dynamic import + sha256 cache
    storage-idb/         # IDB schema, projects/files/blobs/snapshots
                         #   + createIdbProjectRepository() — @ports.ProjectRepository impl
    storage-memory/      # in-memory ProjectRepository (tests, future CLI)
    logger/              # Console / Buffered / Noop logger adapters
    emu/                 # EmuBackend interface + AltirraBackend impl (loadMedia + hardware setters + AudioWorklet)

  plugins/               # built-in plugin instances
    converters/          # asset converters (Phase 7)
    editors/             # plugin file editors (Phase 11)
    machine-atari-xl/    # MachinePlugin v0.4.0 first impl — display/audio/input/memoryMap/media{xex,atr,car,cas}/hardwareConfig/bootEquates
    toolchain-mads/      # ToolchainPlugin v0.5.0 first impl
      mads.ts            # plugin wrapper
      wasm-mads/         # MADS WASI runner + .lst sourceMap + .lab parser (private to plugin)

  app/                   # workbench wiring + non-React state
    createWorkbench.ts   # headless workbench factory (DOM-free, test-friendly) — registers machine + toolchain in PluginRegistry, exposes workbench.{machine,toolchain}
    workbench-context.tsx # React provider + useWorkbench() — wires IDB / console adapters
    plugin-registry-glue.ts # supervised re-exports of @plugins helpers for @ui
    state/store.ts       # useProject() — files, activeName, updateActive
    fileTemplates.ts     # seed text for "new file" of each known ext
    labels.ts            # MADS label / equate / token registry

  ui/                    # React tree + react-bound hooks + assets
    App.tsx              # root; owns cpu / bp lines / source map / polling
    App.css / tokens.css / index.css
    components/
      layout/{MenuBar,DebugBar,StatusBar,Splitter}.tsx
      project/{Explorer,FileTree}.tsx
      editor/{Editor,PluginEditor}.tsx
      debug/{Emulator,Debug,Output}.tsx
      asset/AssetPanel.tsx
      history/HistoryDialog.tsx
      ui/                # Radix wrappers + reusable Dialog/Form atoms
    hooks/
      useAutoAssemble.ts useBreakpointAddrs.ts useCursorMemory.ts
      useDebuggerShortcuts.ts usePluginEditor.ts useProjectLabels.ts
      useSplitterWidth.ts
    codemirror/          # CodeMirror StreamLanguage definitions
      madsLang.ts
      jsConverterLang.ts
    assets/              # static assets (hero.png, svgs)

public/
  wasm/mads.wasm                  # MADS FPC → wasm32-wasip1 (1.9 MB)
  altirra/altirra-core.{wasm,js}  # Altirra wasm core (~4.6 MB + 133 KB)
_notes/altirra/                   # Fork sibling: mikolajmikolajczyk/AltirraSDL, branch madside-embed (Embind loadMedia + hardware setters live here)
wiki/                             # All project documentation
```

Path aliases follow the layer table — `@core/...`, `@ports/...`, `@adapters/...`, `@services/...`, `@plugins/...`, `@app/...`, `@ui/...`. Defined in `tsconfig.base.json` and mirrored in `vite.config.ts` + `vitest.config.ts`. Enforced by `eslint-plugin-boundaries` (commit `01c77ab`).

TypeScript uses **project references**: one tsconfig per layer, root `tsconfig.json` references them all. `tsc -b` builds incrementally; only changed layers recompile. Mirrors the ADR-0002 dependency graph.

- `tsconfig.base.json` — shared compilerOptions + path aliases (composite, emitDeclarationOnly, declaration cache under `node_modules/.tmp/dts`)
- `tsconfig.core.json` / `ports.json` / `adapters.json` / `services.json` / `plugins.json` / `app.json` / `ui.json` — per layer
- `tsconfig.node.json` — Vite config sources
- Root `tsconfig.json` — references all of the above

## Data flow (current)

1. User edits in `Editor` → `updateActive(content)` updates `files` in store.
2. **Auto-assemble:** `useAutoAssemble` debounces 400 ms on `files` change → picks main file (manifest `main`) → `BuildService.build()`. Ctrl/Cmd+S = force-now. Race guard inside the hook — only latest assemble commits.
3. `BuildService` calls the injected toolchain hook (currently `madsToolchain.build` adapted via `toolchainToBuildHook` in `@app/createWorkbench`). MADS plugin writes files into `PreopenDirectory`, instantiates `mads.wasm`, calls `wasi.start()`. WASI shim throws on `proc_exit`; exit code extracted from thrown `code`. Outputs read from VFS: `<main>.xex`, `<main>.lst`, `<main>.lab`. Plugin returns `{ binary, sourceMap, extras: { lst, lab } }`.
4. `App` stores result → `Output` shows stdout/stderr/tag; `sourceMap` resolves breakpoint lines → addresses; addr gutter populated.
5. **Run is separate from assemble:** `result.binary` is *pending*; `onRun` commits it to `loadedXex` which `RunService` loads via `MachineMedia.detect(bytes)` → `EmuBackend.loadMedia(format, bytes)`. Errors don't kill the last-good binary. Altirra core advances 60 Hz `advanceFrame` loop. Trap = PC in breakpoint addr set. On hit → pause + snapshot CPU + memory to `DebugService`. Audio: AudioWorklet (`27fa821`) driven by Altirra POKEY tap.
6. **Step** advances exactly one 6502 instruction via `DebugService.step()` → Altirra `dbg->StepInto` + walk `Advance(false)` until `Stopped`.

## Component map: what owns what

- **`App.tsx`** — root state glue. Owns: `files`, `cpu`, `bp lines per file`, `sourceMap`, polling, tab routing. Intentionally a single root — no Redux/Zustand.
- **`Emulator.tsx`** — canvas + frame loop. Reads `machine.display` dims (`5f33cec`) + pixelFormat (`5b82a5e`). Drives `RunService` (`ee46270`).
- **`Debug.tsx`** — Register + Flags + MemoryView. `MemoryView` surfaces `machine.memoryMap` regions (`dc95b76`). Reads via `DebugService` (`0de34ed`).
- **`useAutoAssemble`** — debounce + race-guard. Dispatches to `BuildService`.
- **`workbench.machine`** — active MachinePlugin (Atari-XL hardcoded in v0.4.0; manifest-driven in M5 0897b06).
- **`workbench.toolchain`** — active ToolchainPlugin (MADS hardcoded in v0.5.0; manifest-driven in M5 0897b06).

## Why these stacks

- **CodeMirror 6** (not Monaco) — 200 KB vs 2 MB+; custom languages via `StreamLanguage`; themes via CSS variables.
- **`@bjorn3/browser_wasi_shim`** (not Wasmer) — tiny, no deps; `PreopenDirectory` + `File` map directly to MADS's plain file I/O; `wasi_snapshot_preview1` only — matches FPC `wasip1` RTL target.
- **Altirra wasm** (over 8bitworkshop) — cycle-exact 6502 + ANTIC + GTIA + POKEY + PIA; debugger primitives (`SetBreakpoint`, `StepInto`); audio tap; save state. Fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed`.

## Emulator interface (v0.4.0)

```ts
interface EmuBackend {
  init(): Promise<void>
  reset(): void
  // Generic media load — format id sourced from MachinePlugin.media.formats.
  // Replaces the old loadXEX-only path (3b73e5d).
  loadMedia(format: string, bytes: Uint8Array): void
  advanceFrame(trap?: TrapFn): number
  step(): number
  cpuState(): CpuRegs
  readMem(addr: number, len: number): Uint8Array
  writeMem(addr: number, bytes: Uint8Array): void
  connectVideo(pixels: Uint32Array): void
  connectAudio(sink: SampledAudioSink): void   // AudioWorklet-backed
  sendKey(code: number, down: boolean): void   // codeToKey from MachinePlugin.input (33eb166, c5aaf5a)
  // Hardware-config setters forwarded from MachinePlugin.hardwareConfig (40e0373).
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

Implementation: `AltirraBackend`. `EightBitWorkshopBackend` removed Phase 12. M4 EmulatorPlugin contract (separate from MachinePlugin) is the future home — issue tracked under epic `578415c` children.

## Storage (IDB)

```
db: madside, version: 2
stores:
  projects   { id, name, createdAt, updatedAt }
  files      { id, projectId, path, content (Uint8Array), updatedAt }   index: [projectId, path]
  snapshots  { id, projectId, ts, summary, tree }                        index: [projectId, ts]
  blobs      { hash, data: Uint8Array }                                   content-addressed dedup
  meta       { key, value }
```

Path-based files (binary + text unified, Phase 11). Snapshots = tree `{ path → contentHash }` + manifest copy. Deduped via blobs (SHA-256 from `@core/hash`).

`createIdbProjectRepository()` (commit `3dfb3a2`) implements `@ports.ProjectRepository`. Memory adapter for tests under `@adapters/storage-memory`.

## Manifest (`project.json`)

Currently v1. Becomes v2 in M5 — schema-validated loader + manifest-driven machine/toolchain/emulator/debugAdapter dispatch (issue 0897b06, open, v0.5.0). Hard cut, no v1 shim. Current shape and v2 target documented in [ADR-0001 §Project manifest v2](../adr/0001-plugin-based-workbench.md#project-manifest-v2).

## Plugin contracts (current)

- **MachinePlugin** (`@ports/plugin-machine`, v0.4.0 shipped) — `display`, `audio`, `input.codeToKey`, `memoryMap`, `devices`, `media{formats,detect,defaultFormat,extToFormat}`, `hardwareConfig{hardwareMode,memoryMode,basic,kernel}`, `bootEquates`, `compatibleToolchains`, `compatibleEmulators`, `defaultPanels`. First impl: `@plugins/machine-atari-xl`.
- **ToolchainPlugin** (`@ports/plugin-toolchain`, v0.5.0 shipped) — `inputExt`, `outputExt`, `build(input) → { ok, binary, stdout, stderr, sourceMap, extras, exitCode }`. First impl: `@plugins/toolchain-mads`. BuildService still wired via DI'd hook (`toolchainToBuildHook`); manifest-id dispatch lands with 0897b06. Contract test harness tracked under 6ede5d8.
- **EmulatorPlugin / DebugAdapter / PanelPlugin / EditorPlugin** — future (M4 follow-up / M6 / M7). EmuBackend lives at `@adapters/emu` until the EmulatorPlugin contract lands.

## Cross-cutting cleanup completed

- M2.5 Foundation: path aliases, project refs, ESLint boundaries, headless workbench, ProjectRepository port + IDB adapter, ADR-0002 through ADR-0006, pre-commit + madge circular guard, Nix flake.
- M3 Services: Build / Run / Debug / AssetPipeline services extracted, EventBus + CommandRegistry + unified PluginRegistry, AssetPipelineService.runAffected (`49d594d`).
- M4 MachinePlugin: display, audio, input KBCODE, memoryMap, media-format dispatch, hardwareConfig setters, bootEquates, sendKey held-key tracking, AudioWorklet migration, pixel format / RGBA fast path.
- Hooks split from App.tsx (824 → 539 lines).
- Utility dedupe: `sha256Hex`, `basename`, `hex`, `pluginLoader` → single source under `@core`.
- 8bitworkshop backend removed.
