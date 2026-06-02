# CLAUDE.md — madside

Context for Claude Code sessions in this repo.

## What this is

In-browser **Web IDE for Atari 8-bit assembly**. Standalone project — full editor,
MADS assembler, Atari800 emulator, debugger, asset pipeline, project management,
all running in the browser. Goal: write non-trivial Atari XL/XE projects without
leaving the page; eventually swap the current emulator core for Altirra wasm for
cycle-exact debugging.

VSCode-style layout: file explorer (left), CodeMirror editor (center), emulator
+ live CPU state + memory hex view (right side panel). Dark, mono, mint accent.
`tokens.css` defines design tokens; styling stays CSS-variable based for a tiny
build stack.

## Status

| Area | State |
|---|---|
| Vite + React + TS skeleton | ✅ |
| CodeMirror 6 + custom MADS stream highlighter | ✅ (no Lezer grammar yet) |
| `mads.wasm` bundled in `public/wasm/` (1.9 MB) | ✅ |
| WASI shim via `@bjorn3/browser_wasi_shim` | ✅ |
| `assemble(main, files)` → `{ok, xex, lst, lab, stdout, stderr}` | ✅ (also emits `-l` listing + `-t` labels) |
| Auto-assemble (debounce 400ms + race guard via seq counter) | ✅ xex committed to emu only on Run |
| Layout: toolbar / [explorer \| editor+output \| emulator+debug side panel] | ✅ vertical right-side panel |
| Altirra (Avery Lee) wasm core via fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed` | ✅ — Phase 12. `public/altirra/altirra-core.{wasm,js}` ≈ 4.6 MB + 133 KB. `src/lib/emu/backends/altirra.ts` |
| Altirra OS kernel | ✅ built into the Altirra wasm core (no external ROM file) |
| Run / pause / step (1 instruction) / frame / reset | ✅ |
| Source-level breakpoints (gutter click, persist across reassemble) | ✅ label lines resolve to next emitting line |
| Active-PC line highlight in editor | ✅ |
| Addr gutter (4-hex per emitting line, refreshes with sourceMap) | ✅ |
| Editor UX: Tab → 8 spaces (indentWithTab), Ctrl/Cmd+S = force assemble (global) | ✅ |
| Editor selection visible (mint 25% / focused 35%) | ✅ |
| MADS `.lst` parser with include-stack heuristic | ✅ |
| CPU state in Debug panel (registers + flags) | ✅ live on pause/break |
| Memory view in Debug | ✅ live `emu.readMem`, 128 B, hex base input, auto-defaults to xex load addr, auto-follows editor cursor (overridable), highlights cursor source-line bytes |
| POKEY audio | ✅ Altirra core POKEY → `IATAudioTap` → JS `ScriptProcessorNode` |
| Emulator keyboard input | ✅ JS keydown/keyup → Atari KBCODE (`POKEY::PushKey` + `ReleaseAllRawKeys`); shift/ctrl via dedicated state setters |
| Per-step display refresh | ⏳ M2 research — snapshot/Apply leaves sim/debugger inconsistent; Frame button (advance 1 frame) is the workaround |
| ATR disk loader | ⏳ M2 — no SIO disk drive wired yet |
| Hosting | ⏳ pick GitHub Pages or Vercel |

## Architecture

```
src/
  App.tsx          # root, layout, state glue (cpu, bp lines per file, sourceMap)
  App.css          # grid: toolbar / [explorer | (editor + output) | (emu + debug)]
  tokens.css       # design tokens (CSS variables — colors, type, spacing)
  index.css        # global resets + button + .label utility
  main.tsx         # createRoot, StrictMode
  lib/
    mads.ts        # WASI shim runner. assemble() emits xex/lst/lab.
    madsLang.ts    # CodeMirror StreamLanguage. OPCODES + DIRECTIVES sets.
    store.ts       # useProject() hook — files + activeName + updateActive.
    emu.ts         # Emu wrapper: create/reset/loadXEX/advanceFrame/step/cpuState/readMem + start/suspendAudio
    audio.ts       # WebAudioSink — implements SampledAudioSink, AudioContext @ machine rate, ScriptProcessorNode + ring buffer
    sourceMap.ts   # MADS .lst parser. addrToLoc + locToAddr maps with include stack heuristic.
    emu/           # vendored 8bw Atari800 (GPL-3.0). @ts-nocheck per file.
      cpu/MOS6502.ts
      machine/atari8.ts
      machine/chips/{antic,gtia,pokey}.ts
      common/{audio,devices,emu,util}.ts   # audio.ts: POKEYSynth (own impl, replaces TSS) + TssChannelAdapter
      LICENSE
  components/
    Toolbar.tsx    # assemble / run / pause / step / frame / reset
    Explorer.tsx   # file list, click to switch active
    Editor.tsx     # CodeMirror 6 + pcLine decoration + bp gutter
    Emulator.tsx   # canvas, frame loop, step + frame-step effects, BP trap
    Debug.tsx      # Reg + Flags + MemoryView (hex), vertical stack
    Output.tsx     # stdout/stderr + OK/ERR tag
public/
  wasm/mads.wasm                # MADS FPC → wasm32-wasip1
  altirra/kernel.rom            # Avery Lee OS-B replacement (permissive license)
```

### Data flow

1. User edits in `Editor` → `updateActive(content)` updates `files` in store.
2. **Auto-assemble**: `App` debounces 400ms on `files` change → `runAssemble()` picks main file (first non-`atari.a65` `.a65`; will switch to `project.json#main` in Phase 1) → `assemble(main, files)`. Ctrl/Cmd+S = force-now (skip debounce). Race guard: `assembleSeqRef` — only latest assemble commits result.
3. `assemble()` writes all files into `PreopenDirectory`, instantiates wasm, calls `wasi.start()`. WASI shim throws on `proc_exit` — exit code extracted from thrown `code`.
4. Outputs read back from VFS: `<main>.xex`, `<main>.lst` (listing for source map), `<main>.lab` (label dump).
5. `App` puts result into state → `Output` shows stdout/stderr/tag, `sourceMap` parsed from `.lst`, breakpoint lines resolved to addresses (label-only lines fall through to next emitting line), addr gutter populated.
6. **Run separates from assemble**: `result.xex` is *pending*; only `onRun` commits it to `loadedXex` which Emulator receives. Errors don't kill last-good xex. → `Emulator` boots Atari800 + altirra kernel, loads xex via 8bw's $f17f hook + DOSVEC stub at $d500, drives 60 Hz `advanceFrame` loop. Trap = PC in breakpoint addr set. On hit → pause + snapshot CPU state + memory to Debug. Audio: `emu.startAudio()` on run (user gesture), `suspendAudio()` on pause.
7. "Step" advances exactly one 6502 instruction, then renders the rest of the frame with CPU neutered (saveState → cpu.advanceClock no-op → ANTIC h=v=0 → advanceFrame → loadState). Display reflects current RAM, CPU stays at the step boundary.

### Why CodeMirror 6 (not Monaco)

- 200KB vs 2MB+
- Custom languages via StreamLanguage easy; Lezer grammar later if needed
- Themes via CSS-in-JS bind cleanly to our CSS variables

### Why `@bjorn3/browser_wasi_shim` (not Wasmer)

- Tiny, no deps, plain TS
- `PreopenDirectory` + `File` model maps directly to MADS's plain file I/O
- `wasi_snapshot_preview1` only — matches what FPC wasip1 RTL targets

## How `mads.wasm` was built

Pipeline lives in this repo: `_notes/wasm-spike/` + `justfile`. One command:

```sh
just build-mads-wasm
```

This clones FPC + Mad-Assembler at the pinned commits (in `justfile`), bootstraps the
FPC wasm32-wasip1 cross-compiler, builds MADS via that compiler with our `crt.pas`
shim, and copies the resulting `mads.wasm` into `public/wasm/`. Sources land in
`_notes/wasm-spike/build/` which is gitignored.

Requirements (assumed on host PATH): `fpc` 3.2.2+, `gnumake`, `git`, `wasmtime` (for
smoke test). Recommended: `nix-shell -p fpc gnumake wasmtime`.

Key files we own:
- `_notes/wasm-spike/crt.pas` — 30-line stub (MADS imports `crt` only for `TextColor`/`NormVideo`; wasip1 RTL has no `crt`).
- `_notes/wasm-spike/smoke.a65` — minimal program used to verify byte-exact xex output.
- `_notes/wasm-spike/REPORT.md` — historical spike notes (sizes, perf, rationale).

Output: `mads.wasm` ≈ 1.9 MB. Byte-for-byte identical `.xex` to native MADS on smoke tests.

**Do not rebuild casually.** Bump the pinned commits in `justfile` deliberately, rerun
`just build-mads-wasm`, smoke-test, then commit the new `public/wasm/mads.wasm`.

## Conventions

- TypeScript strict, no `any` unless absolutely needed (cast through `unknown`).
- React 19 with hooks; no Redux/Zustand yet (`useState` + custom hooks is fine for current scope).
- CSS modules-by-convention: each component has its own `.css` file imported by it. Tokens via CSS variables, not SCSS, to keep build stack minimal.
- No emoji in UI text.
- Tone of UI labels: terse English, lowercase, mono (e.g., `assemble`, `run`, `ready`, `working…`).
- File-naming: components PascalCase, libs camelCase.
- Filenames in `.a65` virtual FS = leaf names only (no paths) **currently**. Phase 1 will switch to path-based (`src/main.asm`, `assets/...`, `generated/...`) — MADS resolves `icl` from project root via `-i:.`.
- **Converters are project data, not IDE code.** Built-in converters in `src/lib/converters/builtins/` are a starter pack; the canonical library lives in a separate repo + on the blog. Project-local converters in `converters/*.js` shadow built-ins by `meta.id`. See Phase 6 for the contract.

## Common commands

```sh
npm run dev          # vite dev server
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist/
npx tsc --noEmit     # typecheck only
```

## Long-term architecture vision

Goal: feature-complete Web IDE for Atari 8-bit (asm + assets + projects + debugger), then swap emulator engine to Altirra wasm. Reach that incrementally — never break the existing playground.

### Project model

A **project** is a directory tree:

```
my-project/
├── src/           # ASM code (editable)
├── assets/        # source assets (PNG, TMX, CSV, BIN) — read-only-ish
├── generated/     # output of asset converters — auto-regenerated, locked by default
└── project.json   # manifest + recipes
```

`project.json` shape:

```jsonc
{
  "version": 1,
  "name": "hello-world",
  "main": "src/main.asm",
  "run": { "default": { "audio": true } },
  "recipes": {
    "assets/player.png": {
      "converter": "png-to-sprite",
      "output": "generated/player.asm",
      "options": { "width": 8, "height": 16, "label": "player_sprite" }
    }
  }
}
```

MADS resolves includes like a normal filesystem (project root + `-i:.`). The manifest does **not** list includes — that's MADS's job. `main` replaces the current "first non-`atari.a65`" heuristic. `recipes` map asset inputs → converter + output path + options.

### Storage (IndexedDB)

```
db: madside, version: 1
stores:
  projects   { id, name, createdAt, updatedAt }
  files      { id, projectId, path, content (Blob/Uint8Array), updatedAt }   index: [projectId, path]
  snapshots  { id, projectId, ts, summary, tree }                            index: [projectId, ts]
  blobs      { hash, data: Uint8Array }                                       content-addressed dedup
  meta       { key, value }   // activeProjectId, schemaVersion
```

- Path-based files (text and binary unified).
- Snapshots = JSON tree of `{ path → contentHash }` + manifest copy. Deduped via `blobs` (sha-256). Auto-snapshot on Ctrl+S (forced) and debounced ~30s no-edit.
- Hash function: Web Crypto SHA-256.
- ZIP export/import via `fflate` (~20KB) — without `generated/` (regenerable).
- Future: File System Access API → "open folder" mode, two-way sync with disk (Chromium first).

### Asset pipeline

Converters are **project data**, not IDE code. A project's `converters/` directory holds self-contained ES modules; the IDE ships only a handful of built-ins as fallback. The intent is an ecosystem outside this repo (separate library repo + blog posts).

**Module contract** (each `converters/*.js`):

```js
export const meta = {
  id: string;            // e.g. "png-to-sprite"; matches recipe.converter
  label: string;
  inputExt: string[];    // e.g. ["png"]
  optionsSchema: OptionSpec[];   // drives auto-generated UI form
};
export default async function convert(input, opts) {
  // input: Uint8Array; opts: Record<string, unknown>
  return { bytes: Uint8Array, mimeHint?: string, summary?: string };
}
```

**Loading.** Project converters loaded via Blob URL + dynamic `import()`, cached by content hash. No sandbox.

**Recipes** live in `project.json`:

```jsonc
"recipes": [
  { "input": "assets/player.png", "output": "generated/player.asm", "converter": "png-to-sprite", "options": { "width": 8 } }
]
```

**Resolve order.** project `converters/<id>.js` → built-in registry.

**Engine.** Hash inputs + options, skip regen if unchanged. Click asset → preview + form → Apply writes recipe + regenerates. Build = `recipeEngine.runAll()` → `assemble(main, allFiles)` → `emu.loadXEX` → run.

**Built-ins** (starter pack): `bin-to-incbin`, `csv-to-data`. The canonical converter library (incl. `png-to-sprite`, `png-to-charset`, `tmx-to-map`, etc.) ships separately. **No Python / Pyodide.** JS-only MVP; TS support deferred (would need `sucrase`).

### Emulator interface (prep for Altirra swap)

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
  width: number; height: number; sampleRate: number;
}
```

Current `Emu` becomes `EightBitWorkshopBackend implements EmuBackend`. UI talks only to the interface. `AltirraWasmBackend` later = drop-in replacement.

### Collab (faaaar future)

Yjs/Automerge CRDT. `Y.Text` per file → free history + real-time sync. `y-indexeddb` for local persistence; WebSocket relay later for multi-user. Migration from plain text is one-shot. Don't block current work on this.

## Roadmap (in priority order)

Phases roll up the long-term vision. Each phase ships standalone — don't pre-empt later phases.

1. **Phase 1 — Storage + project manifest.** ✅ done
   - IDB schema (`projects`, `files`, `blobs`, `snapshots`, `meta`).
   - Path-based files in store (`src/main.asm`).
   - `project.json` load/save (JSON).
   - VFS passes paths to MADS; `-i:.` resolves from project root.
   - SEED migrates to "sandbox" project on first run.
   - `assemble` uses `manifest.main`.
   - Single-project view (no switcher yet).

2. **Phase 2 — Multi-project + ZIP I/O.** ✅ done
   - Project list (sidebar or dropdown): new / open / rename / delete / duplicate.
   - `fflate`-based ZIP export (excludes `generated/`) and import (drag-drop / file picker). Missing `project.json` → auto-create minimal.

3. **Phase 3 — UI primitives pass.** ✅ done — Adopt Radix headless primitives + replace native dialogs. Foundation for Phase 5 (file tree) and Phase 7 (asset panels). Bundle hit ~50KB net, offset later by code-splitting.
   - `@radix-ui/react-dropdown-menu` — rewrite `MenuBar` (free keyboard nav, ARIA, submenu support, focus mgmt).
   - `@radix-ui/react-context-menu` — primitive ready for the file tree's right-click menu.
   - `@radix-ui/react-dialog` — modal-based dialogs (`NewProjectDialog`, `RenameDialog`, `DuplicateDialog`, `ConfirmDialog`) replacing `window.prompt` / `confirm`.
   - `@radix-ui/react-tooltip` — replace native `title=` on `DebugBar` for consistent styling.
   - Keep CSS-variables styling (no Tailwind, no shadcn).

4. **Phase 4 — Component reorg.** ✅ done — Run after Phase 3 so new primitive wrappers land cleanly.
   - `src/components/` split by feature: `layout/` (MenuBar, DebugBar, StatusBar), `project/` (Explorer + future FileTree), `editor/` (Editor), `debug/` (Emulator, Debug, Output), `ui/` (Radix wrappers + reusable Dialog/Form atoms).
   - No storage / lib refactor — those are already well-separated.

5. **Phase 5 — File tree + file CRUD.** ✅ done (DnD move deferred) — Built on top of Phase 3 primitives.
   - Replace flat Explorer list with a collapsible tree (folders from path prefixes).
   - Right-click context menu (Radix `ContextMenu`): new file / new folder / rename / delete / duplicate / reveal-in-explorer (Phase 10 FSA hook).
   - Header buttons for new file / new folder (also accessible via context menu on empty area).
   - Inline rename on F2 / double-click.
   - Drag-and-drop within tree to move (lower priority — can land later).
   - Storage layer additions: `renameFile`, `deleteFile`, `createFile`, `moveFile`.
   - Decision: which file is "main" — manifest controls, but UI shows the marker (e.g. bullet on the main file) + "Set as main" context-menu item.

6. **Phase 6 — Editor intelligence (autocomplete).** ✅ done (6A/6B/6C; 6D deferred) — Slotted before the asset pipeline so writing converters (Phase 7) lands in an editor that already understands JS, and so editing assembly day-to-day benefits from completion as early as possible. Built on `@codemirror/autocomplete` (~30KB gzip).

   **Sub-phase 6A — ASM autocomplete (MVP).**
   - Static set: opcodes (LDA/STA/JMP/…) + directives (`org`, `icl`, `dta`, `equ`, …) sourced from the same lists `madsLang.ts` uses for highlighting.
   - Doc-local labels: scan the active buffer for label declarations (column-0 alphanumeric, optional trailing `:`). Refresh on doc change.
   - Project-wide labels: parse the most recent assemble's `.lab` output into `Map<symbol, addr>`; include those symbols in completion. Address shows as detail.
   - Wire as `madsLanguage().data.of({ autocomplete: source })`.
   - Triggers: typeahead on alphanumeric + `.`, manual `Ctrl+Space`.

   **Sub-phase 6B — ASM extras.**
   - Snippets (CodeMirror snippet syntax with tab stops) for common idioms: `lda #imm`, `ldy #0` + `loop` skeleton, `jsr` patterns, etc.
   - "Go to definition" on labels: Ctrl+click jumps to declaration using `.lab` + sourceMap.
   - Hover tooltip: opcode docs (cycle counts, flags affected). Pull from a small bundled table.
   - Hex/dec preview on number under cursor.

   **Sub-phase 6C — JS autocomplete (MVP).**
   - Comes mostly for free via `@codemirror/lang-javascript` (keyword completion, scope-aware locals from Lezer).
   - Curated snippets: scaffold a new converter (`meta` block + `convert(input, opts)` body) when typing `convert` at top of an empty `converters/*.js`.
   - Light docs for our converter API surface: `meta.optionsSchema` shape, return type, common helpers (`TextDecoder`, `createImageBitmap`).

   **Sub-phase 6D — JS richer (deferred until Phase 11+).**
   - Full TS Language Service in-browser (~1MB) for IntelliSense + type errors + refactoring, or a worker-hosted LSP via `vscode-languageserver-protocol`. Out of scope until ecosystem maturity demands it.

   **Open decisions (pin before 6A starts):**
   1. Case: opcodes case-insensitive (MADS accepts both); show as lowercase in suggestions. Labels case-sensitive, preserve original.
   2. Filter: prefix match with fuzzy fallback.
   3. Triggers: alphanumeric + `.` (dot-directives).
   4. Snippet placeholders: CodeMirror snippet syntax (`${1:placeholder}`).
   5. `.lab` parser: stream output, store `Map<symbol, addr>` in App state next to `sourceMap`.

7. **Phase 7 — Asset pipeline.** ✅ done (7A/7B: contract + built-ins `bin-to-incbin`/`csv-to-data` + recipe engine sha-256 skip + AssetPanel form/previews + `+f` template dropdown) — Converters live **in the project**, not baked into the IDE. The IDE ships a handful of built-ins as fallbacks; the canonical library lives in a separate repo + on the blog so an ecosystem can grow without coupling to madside releases.

   **Project layout.** Each project has a `converters/` directory rendered as a normal folder in the file tree (no special treatment). Every `.js` file in `converters/` is a converter — self-contained ES module, no shared utility imports, no other project deps. Drop file in → it works. Copy-pasteable between projects.

   **Converter contract.** Each module exports `meta` (UI/registry metadata) and a default async function (`ConvertFn`):

   ```js
   // converters/png-to-sprite.js
   export const meta = {
     id: "png-to-sprite",
     label: "PNG → Sprite",
     inputExt: ["png"],
     optionsSchema: [
       { name: "width",  type: "number", default: 8, min: 1, max: 64 },
       { name: "height", type: "number", default: 16 },
       { name: "label",  type: "string", default: "sprite_data" },
     ],
   };

   export default async function convert(input, opts) {
     // input: Uint8Array (raw file bytes)
     // opts:  Record<string, unknown> validated against optionsSchema
     return {
       bytes: new Uint8Array(...),      // emitted file contents
       mimeHint?: "text/x-asm",         // hint for tree icon + editor
       summary?: "8×16 sprite, 16 bytes",
     };
   }
   ```

   **Recipes (`project.json`).** Recipe is a plain map input → output → converter id (+ options). Engine matches `converter` id against project converters first, then built-in registry.

   ```jsonc
   {
     "version": 1,
     "name": "demo",
     "main": "src/main.asm",
     "recipes": [
       { "input": "assets/player.png",  "output": "generated/player.asm",  "converter": "png-to-sprite",  "options": { "width": 8, "height": 16 } },
       { "input": "assets/charset.png", "output": "generated/charset.asm", "converter": "png-to-charset" },
       { "input": "assets/level.csv",   "output": "generated/level.asm",   "converter": "csv-to-data",    "options": { "label": "level_data" } }
     ]
   }
   ```

   **Loading.** Per-project converters loaded via `URL.createObjectURL(new Blob([source], { type: "text/javascript" }))` + dynamic `import(url)`. Cache by content hash. No sandbox — user's own code, user's own machine, full `window` access. Built-in registry is plain TS at `src/lib/converters/builtins/`, loaded eagerly.

   **Resolve order.** project `converters/<id>.js` → built-in registry. Project file shadows same-id built-in.

   **Recipe engine.** Hash inputs (sha-256 of input bytes + canonicalized options JSON). Skip regen if hash unchanged. Stale recipe entries (input no longer exists) → warn, no error.

   **Build step.** `Run` button orchestrates: `runAllRecipes()` (regenerate stale entries) → `assemble(main, files)` → `loadXEX` + run. Build progress visible in Output / Status bar.

   **Built-ins shipped with the IDE** (starter pack): `bin-to-incbin` (trivial — validates pipeline end-to-end), `csv-to-data`. Reference `png-to-sprite` as a built-in is debatable; prefer documenting it on the blog so users see "this is what a converter looks like."

   **Canonical library** lives outside this repo. The plan is: a separate GitHub/Radicle repo + matching blog posts. madside has zero knowledge of where users get their converters from — they just paste files into `converters/`. Distribution: copy-paste from blog, `git submodule`-style copy, eventually a registry/marketplace if it makes sense.

   **Editor support.** `Editor.tsx` needs a JS language mode (CodeMirror 6 `@codemirror/lang-javascript`) so editing converter files isn't a plain text experience. TS support deferred — would require `sucrase` (~25KB) or similar to strip types before `import()`. JS-only is the MVP.

   **What we don't do here.** No sandboxing. No permission model. No worker isolation (might come if heavy converters need to run off the main thread). No type checking of converter modules at load. Errors surface in Output panel.

8. **Phase 8 — History.** ✅ done (content-addressable snapshots, auto-snap 30s + Ctrl+S, restore/delete dialog; blob GC + prune policy + diff preview deferred)
   - Auto-snapshot (forced on Ctrl+S, debounced 30s no-edit).
   - Snapshot panel: list, preview, restore (overwrite or fork).
   - Blob dedup; prune policy TBD.

9. **Phase 9 — Emulator interface refactor.** ✅ done (`EmuBackend` interface + `EightBitWorkshopBackend`, `createEmu()` facade; UI no longer touches `machine.cpu.*`)
   - Extract `EmuBackend`; current code → `EightBitWorkshopBackend`.
   - All UI / app code uses the interface only.

10. **Phase 10 — File System Access API.** ⏳ next (Chromium-first; entry: `showDirectoryPicker()` + two-way sync with disk)
    - "Open folder" mode → sync project files with on-disk directory.

11. **Phase 11 — Custom file editors plugin API.** ✅ done (contract + registry + Blob-URL loader + PluginEditor host + reference `bitmap` built-in for `.1bpp`/`.bmp1`; manifest `editors: { ext: path }` mapping) — Mirrors the converter plug-in model from Phase 7 but for *editing* (level editor, music tracker, sprite editor, etc.). Goal: an ecosystem of editors that ship alongside or independently of madside.

    **Module contract.** Each project carries `editors/*.js`; each module is a self-contained ES module:

    ```js
    export const meta = {
      id: "tilemap-editor",
      label: "Tilemap editor",
      fileExt: ["tmx", "tilemap"],   // extensions this editor handles
    };
    export default {
      // Called when the user opens a matching file. `container` is a fresh
      // <div> owned by the host; do whatever you want with it (canvas, DOM,
      // even mount your own framework). Return a cleanup handle.
      mount(container, ctx) {
        // ctx = {
        //   value: Uint8Array,                   // current file bytes
        //   onChange: (bytes: Uint8Array) => void,
        //   assets: { path: string; bytes: Uint8Array }[],   // other project files
        //   onAddRecipe?: (recipe) => Promise<void>,         // optional Phase 7 hook
        // };
        return { destroy() { /* unmount */ } };
      }
    };
    ```

    **Manifest mapping** picks the editor per file extension:

    ```jsonc
    "editors": { "tmx": "editors/tilemap.js", "wav": "editors/wave.js" }
    ```

    Without a mapping, the host falls back to `AssetPanel` (recipe form) or `Editor` (code) based on the existing rules.

    **Loading** reuses the converter pattern: Blob URL + dynamic `import()`, content-hash cache, no sandbox.

    **Conventions for plugin authors.**
    - Use **vanilla DOM / canvas**, not React. Avoiding React imports inside plugins removes version-pinning headaches and keeps the contract tiny.
    - Plugins must be `mount`/`destroy`-clean; the host may swap them on every file switch.
    - Errors thrown from `mount`/`onChange` bubble to a host-side error boundary; on failure the editor falls back to AssetPanel.

    **Open Qs:**
    1. Multi-tab / split-view support for plugins (one editor instance per tab)? Defer.
    2. Inter-editor communication (e.g. tracker references samples from explorer)? Pub/sub via `ctx.bus`? Defer.
    3. Reference editor to ship as built-in (tile-map? simple bitmap?) — decide once binary file storage lands.

    **Hard prerequisite:** binary file storage end-to-end (see backlog). Without it `ctx.value` and `ctx.assets` can't represent images, samples, etc. faithfully.

12. **Phase 12 — Altirra core swap (feature-complete emulator).** ✅ M1 done, ⏳ M2 in progress.

    **M2 done:**
    - Full CPU state via per-register Embind getters (A/X/Y/SP/P + flag decode).
    - Source-level breakpoints via `IATDebugger::SetBreakpoint` + `ATDebuggerBreakpointInfo`. Debugger halts sim → `Advance()` returns `Stopped` → JS pauses.
    - Single-instruction step via `ATDebugger::StepInto(kATDebugSrcMode_Disasm)` + `ATCPUStepCondition::CreateSingleStep()`. CPU emits `kATSimEvent_CPUSingleStep`; host walks `Advance(false)` until Stopped.
    - Stable PC sampling — `getPC()` caches `mLastStablePC` updated only at instruction boundaries (`!IsInstructionInProgress()`), so the host never reads a mid-fetch PC like `$2018` when the CPU is sitting on `JMP $2017`.
    - Audio bridge: `IATAudioTap` collects raw float32 samples in C++; JS pulls via `getAudioSamples()` per `ScriptProcessorNode.onaudioprocess`. ScriptProcessor used over AudioWorklet to skip module-loading complexity.
    - Keyboard injection: `sendKey(keyCode, charCode, isDown, modifiers)` mapped to Atari KBCODE (table cribbed from `bridge_commands_write.cpp::kKeyMap`) → `ATPokeyEmulator::PushKey` / `ReleaseAllRawKeys`. Shift / Ctrl via `SetShiftKeyState` / `SetControlKeyState`.
    - Frame button = `advanceFrame()` (one full ANTIC frame; display + RAM both advance). PC indicator hidden during Run (`pcLine` returns null when `running=true`) so the editor doesn't follow stale state.
    - Memory follows editor cursor (auto base = source-line addr aligned to 128B page) until user manually edits base. Hex view highlights bytes from the cursor's source line (combined `addrToLoc` count + `next-emitting-line` span — covers `dta` strings that MADS only partially lists).

    **M2 deferred / known limits:**
    - **Per-step display refresh.** Snapshot/Apply trick was tried (`CreateSnapshot` + `ApplySnapshot`) but Apply leaves `mbRunning=true` plus inconsistent debugger linkage, so the next `dbg->StepInto` bails on `IsRunning()` early-return. `GTIA::UpdateScreen(true, true)` only redraws the cached last frame. Workaround: Frame button refreshes display by advancing one frame (also moves CPU). Real per-step display needs either (a) a working Apply-then-rearm sequence we haven't found, or (b) a direct ANTIC scanline render path that doesn't tick the scheduler.
    - **ATR disk.** No SIO disk drive wired up. xex-only for now.
    - **`SetMemoryClearMode(Zero)`** forced at boot because the default `DRAM3` pattern made post-reset RAM look like `FF 00 FF 00` instead of zeros, which was misleading in the UI.

    **M3 deferred:** FujiNet network bridge, VBXE.

    **Source:** fork of [ilmenit/AltirraSDL](https://github.com/ilmenit/AltirraSDL) (GPLv2, SDL3 + ImGui port of Altirra). Upstream already ships a full-emulator wasm build (~7 MB w/ ImGui UI) but no headless / embed mode.

    **Strategy:** keep Altirra core intact, strip UI/GL/ImGui/netplay/SDL audio+video. Expose Embind facade matching our `EmuBackend` interface. Lazy-loaded `altirra-core.{wasm,js}` in `public/altirra/`.

    **Feature coverage (M1 — must-have):**
    - 6502 CPU + ANTIC + GTIA + POKEY + PIA — full Altirra accuracy.
    - Memory: 64K + 130XE 128K banking.
    - Keyboard, joystick, paddle (via `sendKey` extensions).
    - XEX loader, audio out (POKEY → WebAudioSink), video out (→ Uint32Array).
    - Save/load state for step trick + future time-travel debug.
    - Cartridge mappers — for free because core code stays untouched.
    - Memory expansions beyond 130XE (Rambo, AXLON, Compy) — for free.

    **M2 — nice:** ATR disk, full PBI device set, more controller types.

    **M3 — deferred:** **FujiNet / network bridge** (emulate SIO device in JS → WebSocket/fetch); **VBXE** graphics extension.

    **What's intentionally dropped:** Altirra debugger UI (we have CPU/mem view + BP), ImGui menus/dialogs (React UI), RetroArch shaders, netplay lobby.

    **Migration phases:**

    | F | Step | Notes |
    |---|------|-------|
    | F1 | Fork on GH + clone + `upstream` remote + branch `madside-embed` | base for delta |
    | F2 | Baseline native build (Linux) + baseline wasm build per HOSTING.md | verify toolchain |
    | F3 | Identify core surface in `src/` — list files to keep vs strip | ~1 day |
    | F4 | New CMake target `altirra_core` (`-DALTIRRA_EMBED_MODE=ON`); exclude ImGui/GL/netplay; emcc flags `-sMODULARIZE -sEXPORT_ES6 -sALLOW_MEMORY_GROWTH -lembind` | 1–2 days |
    | F5 | `src/embed/binding.cpp` with Embind API matching `EmuBackend` | 1–2 days |
    | F6 | Wasm build → `altirra-core.{wasm,js}` (target < 3 MB) | 1 day |
    | F7 | `src/lib/emu/backends/altirra.ts` → `AltirraBackend implements EmuBackend`, lazy load via dynamic import of glue.js | half day |
    | F8 | `justfile` target `build-altirra-wasm` in madside repo (clone fork → emcc → install to `public/altirra/`) | hours |
    | F9 | Switch `createEmu()` to `AltirraBackend`. Smoke hello-world XEX, pixel/audio diff vs 8bw | hours |
    | F10 | Rip vendored 8bw (`src/lib/emu/`). Update CLAUDE.md emu section. | hours |

    **Estimate:** 1–2 weeks of work, F3–F6 the bulk (emscripten + CMake gymnastics).

    **Decisions (locked):**
    1. Fork: `github.com/mikolajmikolajczyk/AltirraSDL`.
    2. **Upstream-friendly delta** — `-DALTIRRA_EMBED_MODE=ON` CMake flag, PR-able. Discipline: no upstream file edits unless gated behind the flag.
    3. **Clean rip of 8bw** after F10 stabilizes — no fallback toggle. (`src/lib/emu/` vendored 8bw deleted; `kernel.rom` removed.)
    4. **OS kernel:** use Altirra core's built-in OS replacement (drop `public/altirra/kernel.rom`).

13. **Phase 13 — IDE documentation (book-style).** ⏳ after Altirra swap — Rust-book-flavored user manual.

    **Decisions:**
    - **Stack:** Astro Starlight (static HTML, auto sidebar, Pagefind full-text search, dark/light, MDX, shiki highlighting). Closest "Rust book" feel in modern toolchain; no Rust dep, no React lock-in.
    - **Location:** `docs/` workspace inside this repo (own `package.json`, own `astro.config.mjs`). `justfile` recipes: `just docs-dev`, `just docs-build`.
    - **Hosted at `/docs/`** on the same Pages site as the IDE. Help menu links out (external tab, no iframe).
    - **Language:** English only.
    - **Versioning:** latest-only on day one — no per-release branches/snapshots.
    - **Audience split:** `docs/` = user-facing; `CLAUDE.md` stays the developer notes (architecture, decisions, roadmap).

    **Chapter outline:**
    1. Introduction (what madside is, audience)
    2. Getting Started (create project, hello world, run)
    3. The Editor (autocomplete, hover, goto-def, breakpoints, shortcuts)
    4. Projects (manifest schema, file tree, main file, ZIP I/O)
    5. Writing Assembly (MADS conventions, paths, `icl`, atari.a65, source map)
    6. Asset Pipeline (recipes, built-in converters, writing your own — link external lib)
    7. Debugging (run/pause/step/frame/BP, memory view, CPU state, auto-pause-before-BP)
    8. History (snapshots auto/manual, restore, diff, prune)
    9. Plugin Editors (contract, `mount(ctx)`, manifest `editors.<ext>`, reference `bitmap`)
    10. Emulator Internals (8bw backend, POKEY poly noise + 16-bit links, Altirra plans)
    11. Reference (keyboard shortcuts, file extensions, manifest fields, IDB schema)
    12. FAQ / Troubleshooting
    13. Contributing (link to CLAUDE.md + justfile build pipeline)

    **Milestones:**
    - **M0** — Starlight boilerplate + Hello World + Getting Started chapter.
    - **M1** — All chapters as 1–2 paragraph stubs.
    - **M2** — Full content + screenshots / gifs.
    - **M3** — Search index, deploy under `/docs/`, Help-menu wire-up.

    **Style guidelines:** task-oriented intros ("How to add a converter") + reference block at chapter end. Code samples in `.a65` with shiki highlight. Use Atari-domain examples (sprite, charset, scroll) over abstract demos.

14. **Phase 14+ — Hosting, lesson mode, embedding, collab.** ⏳ todo
   - GitHub Pages or Vercel hosting (decide before lesson mode goes live).
   - Lesson mode driven by JSON in `public/lessons/` — guided "leetcode for Atari" track.
   - Embedding: `?src=` (base64-url JSON for small projects) or `?gist=` (for big projects) so external sites can drop madside into an iframe pre-loaded with a project. Use case: blog posts, docs, tutorials.
   - Yjs/Automerge collab when there's a real second user.
   - (Altirra wasm core moved up — see Phase 12.)

## Session backlog (small wins, fit in between phases)

| Item | Status | Priority | Note |
|---|---|---|---|
| Binary file storage end-to-end | ✅ done | — | `FileEntry.content: Uint8Array`. PNG/JPG preview now real. Unlocked Phase 11. |
| Resizable side panel splitter | ✅ done | — | Splitter component; widths persisted to localStorage. |
| POKEY polynomial noise (poly4 / poly9 / poly17) | ✅ done | — | Fibonacci LFSRs POLY4/5/9/17, NOTPOLY5/POLY9 selection. |
| Persist breakpoints across refresh | ✅ done | — | IDB schema v2 + per-project store. |
| Emulator keyboard input wired to canvas | ✅ done | — | tabIndex + focus → key forwarding. |
| Code-splitting bundle | ✅ done | — | Lazy emu/AssetPanel/HistoryDialog/lang-javascript/lang-json + Editor + `@codemirror/commands`. Main ~223KB gzip (was ~293). Radix lazy deferred — diminishing returns. |
| POKEY 16-bit linked channels (CH1_CH2 / CH3_CH4) | ✅ done | — | AUDCTL.3/.4 — low ch silent, high ch drives combined 16-bit period (fast: AUDF+7; slow: (AUDF+1)*baseDiv). |
| Snapshot cleanup (blob GC, prune policy, diff preview) | ✅ done | — | `gcOrphanBlobs()` on delete; auto-prune keeps last 100 auto-snapshots, manual immune; `diffSnapshots()` + Diff button vs previous in HistoryDialog. |
| Source map: lines with `FFFF>` / `XXXX-XXXX>` prefixes | ✅ done | — | PREFIX_RE captures range end; byte count from `YYYY-XXXX+1` when present, else hex-token count fallback. |
| Auto-pause one instruction before BP fires (state *before* trapped op) | ✅ done | — | trap requires `isAtInstrBoundary()` so pause snapshot reflects pre-execution state. |
| Frame-step (button "frame") reuses step's snapshot/no-cpu trick | ✅ done | — | new `frameRefresh()` on backend — display advances one frame without progressing CPU. |

## Deliberately deferred (don't implement unprompted)

- Lezer grammar for MADS (StreamLanguage is enough for now)
- Light mode
- User accounts / cloud sync (Phase 14+ collab covers this)
- MADS error → editor lint markers (post-emulator, when error parsing is settled)
- Step-over (need PC+instruction-length lookup; step-into via single step works fine)
- (AltirraSDL migration — promoted to Phase 12, no longer deferred.)
- Cycle-exact xex breakpoints / .lab symbol resolution UI (.lab parsed but not surfaced)
- Python / Pyodide for asset converters — confirmed out
- localStorage persistence — superseded by IDB plan
- Backend / cloud sync — IDB + FSA only

## Open design questions (decide before Phase 1)

1. Path separator: `/` (POSIX) everywhere. Confirmed default.
2. `generated/` files: read-only with explicit "unlock" (detaches recipe), or freely editable? Sugg: read-only-with-unlock.
3. MADS includes search path: project root + auto `-i:src/ -i:generated/`, or recursive? Verify against MADS docs.
4. `project.json` editable as a normal file in editor (advanced) **and** via UI panels — both, with UI as convenience layer.
5. Asset previews per type: PNG (canvas), CSV (table), TMX (grid). Lazy-loaded.
6. Converter outputs: text (`.byte $aa,$bb…`) preferred for readability; `incbin` only for large blobs.
7. Atari OS equates (`atari.a65`): keep as `src/atari.a65` in seed project, or move to a shared library injected by the manifest?
8. `project.json` rename collisions on duplicate: auto-suffix `(2)` or error? Sugg: auto-suffix.
9. Snapshot prune policy: keep last N (e.g. 100), or time-tiered (last 24h all, hourly for week, daily for month). Decide at Phase 8.
10. File management UX (create / rename / delete) in Explorer — needs design before any UI work. See `~/.claude/projects/-home-mikolaj-src-madside/memory/feedback_scope.md`.

