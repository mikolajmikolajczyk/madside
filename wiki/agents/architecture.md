# Architecture (current state)

> Layered layout from [ADR-0002](../adr/0002-layering.md). Service extraction + plugin contracts arrive in M3–M9; for now the folders are placeholders for services and ports while business logic still mostly lives wherever it has lived since Phase 12.

## Repo shape (ADR-0002 layout)

```
src/
  main.tsx               # Vite entry; renders @ui/App into #root

  core/                  # pure utilities, zero side effects
    hash.ts              # sha256 over Uint8Array / string
    path.ts              # basename / dirname / extOf
    hex.ts               # number → hex formatting / parsing

  ports/                 # interfaces only (implementations live in @adapters)
    index.ts
    errors.ts            # WorkbenchError hierarchy + Result<T, E> helpers (ADR-0004)
    logger.ts            # Logger contract
    event-bus.ts         # EventBus + WorkbenchEvents declaration-merging map
    command-registry.ts  # CommandRegistry (commands, dispatch, shortcuts)
    plugin-registry.ts   # PluginRegistry (kinds, entries, project/builtin shadow)
    project-repository.ts # ProjectRepository + Project / Snapshot models
    services/            # Build/Run/Debug/AssetPipeline contracts (impl in M3)

  services/              # workbench-core services (impl)
    index.ts
    event-bus.ts         # createEventBus() — typed pub/sub, hand-rolled, ~50 LOC
                         #   Services emit; UI subscribes via useWorkbench().events.
                         #   Replaces prop-drilled onBreak / onBuild / onProject* callbacks.
    command-registry.ts  # createCommandRegistry() — id-keyed Map + when() gate
    plugin-registry.ts   # createPluginRegistry() — per-kind Map; project shadows builtin
    build-service.ts     # createBuildService() — recipe engine → toolchain → events; DI'd via @app
    run-service.ts       # createRunService() — emulator lifecycle + audio; backend factory DI'd
    debug-service.ts     # createDebugService() — step / BP / cpuState / readMem via RunService.backend()
    asset-pipeline-service.ts # createAssetPipelineService() — runAll / runOne / runAffected; emits recipes:start/done

  adapters/              # port implementations
    plugin-loader.ts     # Blob URL + dynamic import + sha256 cache
    storage-idb/         # IDB schema, projects/files/blobs/snapshots
                         #   + createIdbProjectRepository() — @ports.ProjectRepository impl
    storage-memory/      # in-memory ProjectRepository (tests, future CLI)
    logger/              # Console / Buffered / Noop logger adapters
    wasm-mads/           # MADS WASI runner + .lst source-map + .lab parser
    emu/                 # EmuBackend interface + AltirraBackend impl

  plugins/               # built-in plugin instances + registries (M3 splits registries into services)
    converters/          # asset converters (Phase 7)
    editors/             # plugin file editors (Phase 11)
    machine-atari-xl/    # MachinePlugin v0.4.0 first impl

  app/                   # workbench wiring + non-React state
    createWorkbench.ts   # headless workbench factory (DOM-free, test-friendly)
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
    hooks/               # extracted from App.tsx in Phase 12
      useAutoAssemble.ts
      useBreakpointAddrs.ts
      useCursorMemory.ts
      useDebuggerShortcuts.ts
      usePluginEditor.ts
      useProjectLabels.ts
      useSplitterWidth.ts
    codemirror/          # CodeMirror StreamLanguage definitions
      madsLang.ts
      jsConverterLang.ts
    assets/              # static assets (hero.png, svgs)

public/
  wasm/mads.wasm              # MADS FPC → wasm32-wasip1 (1.9 MB)
  altirra/altirra-core.{wasm,js}  # Altirra wasm core (~4.6 MB + 133 KB)
_notes/altirra/                # Fork sibling: mikolajmikolajczyk/AltirraSDL, branch madside-embed
wiki/                          # All project documentation
```

Path aliases follow the layer table — `@core/...`, `@ports/...`, `@adapters/...`, `@services/...`, `@plugins/...`, `@app/...`, `@ui/...`. Defined in `tsconfig.base.json` and mirrored in `vite.config.ts` + `vitest.config.ts`.

TypeScript uses **project references**: one tsconfig per layer, root `tsconfig.json` references them all. `tsc -b` builds incrementally; only changed layers recompile. Mirrors the ADR-0002 dependency graph except where current code still violates the layering (transitional references commented `TODO(M3)` — disappear once service extraction lands).

- `tsconfig.base.json` — shared compilerOptions + path aliases (composite, emitDeclarationOnly, declaration cache under `node_modules/.tmp/dts`)
- `tsconfig.core.json` / `ports.json` / `adapters.json` / `services.json` / `plugins.json` / `app.json` / `ui.json` — per layer
- `tsconfig.node.json` — Vite config sources
- Root `tsconfig.json` — references all of the above

## Data flow (current)

1. User edits in `Editor` → `updateActive(content)` updates `files` in store.
2. **Auto-assemble:** `App` debounces 400 ms on `files` change → `useAutoAssemble` picks main file (manifest `main`) → `assemble(main, files)`. Ctrl/Cmd+S = force-now (skip debounce). Race guard via `assembleSeqRef` — only latest assemble commits result.
3. `assemble()` writes all files into `PreopenDirectory`, instantiates wasm, calls `wasi.start()`. WASI shim throws on `proc_exit`; exit code extracted from thrown `code`.
4. Outputs read back from VFS: `<main>.xex`, `<main>.lst` (listing → sourceMap), `<main>.lab` (label dump → autocomplete).
5. `App` stores result → `Output` shows stdout/stderr/tag; `sourceMap` parsed from `.lst`; breakpoint lines resolved to addresses; addr gutter populated.
6. **Run is separate from assemble:** `result.xex` is *pending*; only `onRun` commits it to `loadedXex` which Emulator receives. Errors don't kill the last-good xex. → `Emulator` boots Altirra core, loads xex, drives 60 Hz `advanceFrame` loop. Trap = PC in breakpoint addr set. On hit → pause + snapshot CPU + memory to Debug. Audio: `emu.startAudio()` on run (user gesture), `suspendAudio()` on pause.
7. **Step** advances exactly one 6502 instruction via Altirra `dbg->StepInto` + walk `Advance(false)` until `Stopped`.

## Component map: what owns what

- **`App.tsx`** — root state glue. Owns: `files`, `cpu`, `bp lines per file`, `sourceMap`, polling, tab routing. Reduced 824→539 lines via hook extraction in Phase 12 cleanup. Intentionally a single root — context-owning sub-modules planned (M3-services), not Redux/Zustand.
- **`Emulator.tsx`** — canvas, frame loop, step + frame-step effects, BP trap. Imports `EmuBackend` directly (will move behind `RunService` in M3).
- **`Debug.tsx`** — Register + Flags + MemoryView. Imports `EmuBackend` directly (will move behind `DebugService` in M3).
- **`useAutoAssemble`** — debounce + race-guard + result commit. Will move into `BuildService` in M3.

## Why these stacks

- **CodeMirror 6** (not Monaco) — 200 KB vs 2 MB+; custom languages via `StreamLanguage`; themes via CSS variables.
- **`@bjorn3/browser_wasi_shim`** (not Wasmer) — tiny, no deps; `PreopenDirectory` + `File` map directly to MADS's plain file I/O; `wasi_snapshot_preview1` only — matches FPC `wasip1` RTL target.
- **Altirra wasm** (over 8bitworkshop) — cycle-exact 6502 + ANTIC + GTIA + POKEY + PIA; debugger primitives (`SetBreakpoint`, `StepInto`); audio tap; save state. Fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed`.

## Emulator interface (Phase 9 — stable)

```ts
interface EmuBackend {
  init(): Promise<void>;
  reset(): void;
  loadXEX(bytes: Uint8Array): void;
  advanceFrame(trap?: TrapFn): number;
  step(): number;
  cpuState(): CpuRegs;
  readMem(addr: number, len: number): Uint8Array;
  writeMem(addr: number, bytes: Uint8Array): void;
  connectVideo(pixels: Uint32Array): void;
  connectAudio(sink: SampledAudioSink): void;
  sendKey(code: number, down: boolean): void;
  saveState(): unknown;
  loadState(s: unknown): void;
  setBreakpoints(addrs: Set<number>): void;
  width: number; height: number; sampleRate: number;
}
```

Implementations: `AltirraBackend` (current). `EightBitWorkshopBackend` removed Phase 12. In M4 a new `EmulatorPlugin` contract wraps this — `EmuBackend` may absorb or become an internal detail of plugins/emulator-altirra/.

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

Path-based files (binary + text unified, Phase 11). Snapshots = tree `{ path → contentHash }` + manifest copy. Deduped via blobs (SHA-256 from `lib/util/hash.ts`).

## Manifest (`project.json`)

Currently v1. Becomes v2 in M5 (hard cut). Current shape and v2 target are documented in [ADR-0001 §Project manifest v2](../adr/0001-plugin-based-workbench.md#project-manifest-v2).

## Cross-cutting cleanup completed

- Hooks split from App.tsx (824→539 lines)
- Utility dedupe: `sha256Hex` ×4, `basename` ×4, `hex` ×3, `pluginLoader` ×2 → single source under `lib/util/`
- Debug logs dropped
- 8bitworkshop backend removed
