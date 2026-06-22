# Feature status (current)

> Snapshot of what works today. Roadmap and active issues live in GitHub (`gh issue list --state all`).

## Core stack

| Area | State |
|------|-------|
| Vite + React + TS skeleton | ✅ |
| CodeMirror 6 + custom MADS stream highlighter | ✅ (no Lezer grammar yet — deferred) |
| `mads.wasm` bundled in `public/wasm/` (1.9 MB) | ✅ |
| WASI shim via `@bjorn3/browser_wasi_shim` | ✅ |
| `BuildService.build()` dispatched by `manifest.toolchain` id | ✅ (v0.5.0 443eaed) |
| Auto-assemble (debounce 400 ms + race guard) | ✅ — binary committed to emu only on Run |
| Layout: **Dockview** dockable workbench — drag/dock/float panels, View-menu toggles, named layouts (Desktop/Tablet) + user presets, serialized + persisted | ✅ (ADR-0010) — replaced the legacy resizable splitter entirely (no opt-in flag) |

## Workbench core (services + plugins)

| Area | State |
|------|-------|
| BuildService / RunService / DebugService / AssetPipelineService | ✅ (M3, v0.3.0) |
| EventBus + CommandRegistry + unified PluginRegistry | ✅ (M3) |
| Headless `createWorkbench()` factory (DOM-free, tests use memory adapters) | ✅ |
| project.json v2 schema + validator (`parseProjectManifest`) | ✅ (v0.5.0 443eaed) |
| MachinePlugin port + Atari-XL first impl | ✅ (v0.4.0 a6c310d) |
| ToolchainPlugin port + MADS first impl + manifest-driven dispatch | ✅ (v0.5.0 87f03ad + 443eaed) |
| Second ToolchainPlugin — cc65/ca65/ld65 wasm (`packages/toolchain-ca65`) — C + ca65 asm → NES `.nes` / Atari `.xex` | ✅ (GH #1, #52) |
| Third ToolchainPlugin — z88dk z80asm/sccz80 wasm (`packages/toolchain-z88dk`) — C → ZX Spectrum (binary only; no source-debug yet, #135) | ✅ (#114) |
| Private workspace package extractions — `workbench-core` (services), `storage-idb` (IDB backend) — enforce ADR-0002 layers without npm publish | ✅ (#123, #125) |
| DebugAdapterPlugin port + atari-6502 first impl | ✅ (v0.6.0 2810a62) |
| PanelPlugin port + built-in panels (registers/memory/output/ppu, **variables**, outline, references) — own dock surfaces | ✅ (v0.7.0 5ddf99e; ppu v0.8.0 93c218b; variables #121; outline/references #120) |
| Co-located panel packages (`packages/panel-{memory,registers,ppu,variables}/`) — each self-contained with its CSS | ✅ |
| Event-driven panel refresh via ctx.events / ctx.debug | ✅ (v0.7.0 ba1a27b) |
| FileEditor (Phase 11) folded into PanelPlugin via editorToPanel | ✅ (v0.7.0 6f2dc20) |
| Plugin contract test harnesses under `@ports/test/` | partial — Toolchain ✅ (51e047c); Machine drift test ✅; Debug/Panel pending |
| Plugin author docs under `wiki/plugin-api/` | ✅ (v0.7.0 a7b79c0) |
| Service ↔ UI sync FSM + EventBus + useSyncExternalStore (ADR-0007) | ✅ (v0.7.5 M7.5 epic 152abfd — Run lifecycle reference impl, contract test, dev event logger, property fuzz) |
| Second MachinePlugin — NES (`packages/machine-nes`) | ✅ (v0.8.0 481d76b) — manifest-driven machine selection (1972a36) |
| Second emulator backend — jsnes (`packages/emulator-nes-jsnes`) | ✅ (v0.8.0 b41098c) |
| Named memory-space mechanism (`MachinePlugin.memorySpaces`, `readMemory(addr,len,space)` — cpu/ppu/oam) | ✅ (v0.8.0 93c218b) |
| Editor language generalization — toolchain+CPU-driven (`@core/cpu/mos6502`, `ToolchainPlugin.language`) | ✅ (v0.8.7 1f08b2c, 6ba97ca, 5ee1a42) |
| Bundled templates — `apps/ide/templates/<id>/` via Vite glob, `apps/ide/src/app/templates.ts`, Welcome picker | ✅ (v0.8.5 71acac1, 505492d) |
| Visual `project.json` manifest editor (`apps/ide/src/ui/components/manifest/ManifestEditor.tsx`, form + raw dual-mode) | ✅ (v0.9.0 f6c22ae) — `build.args` → toolchain options wiring (04bdb5a) |
| Courses — format + glob loader + CourseService (`apps/ide/src/app/courses.ts`), lesson→project instantiation (`apps/ide/src/app/course-project.ts`), CoursePanel, declarative check runner (`apps/ide/src/app/check-runner.ts`) | ✅ (v0.9.5 epic 2e9c7cc — 3ed11be, 500f11c, 29540fd, 2921c6c) |
| VFS / virtual filesystem mount layer (`@core/vfs` — Vfs/Mount/VfsProvider, MemoryProvider, ZipAssetProvider, WASI bridge) — toolchains assemble their build FS through it; bundled sysroot mounted read-only in the file tree | ✅ (ADR-0008, GH #55/#56/#57/#50) |
| Persistent IDB asset cache for large wasm modules + sysroots (`packages/core/src/vfs/asset-cache.ts`) | ✅ (GH #54) |
| EmulatorPlugin contract | ⏳ M4 follow-up |

## Emulator (Altirra wasm)

| Area | State |
|------|-------|
| Altirra core via fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed` | ✅ — `packages/wasm-altirra/altirra-core.{wasm,js}` ≈ 4.5 MB + 131 KB; Vite-tracked |
| Altirra OS kernel | ✅ built into wasm core (no external ROM file) |
| Run / pause / step (1 instruction) / frame / reset | ✅ |
| Source-level breakpoints (gutter click, persist across reassemble, IDB schema v2) | ✅ |
| Path-aware breakpoints (`src/main.a65` ↔ `lib/main.a65` resolved independently) | ✅ (v0.7.0 20980c5) |
| Active-PC line highlight in editor | ✅ |
| Addr gutter (4-hex per emitting line) | ✅ |
| CPU state (registers + flags) — descriptor-driven via DebugAdapter | ✅ (v0.6.0 2810a62) |
| Memory view (128 B, hex input, auto load-addr default, follows cursor + ↺ badge to re-engage, machine.memoryMap regions) | ✅ (v0.7.0 c390039) |
| POKEY audio via AudioWorklet | ✅ (v0.4.0 27fa821) |
| POKEY polynomial noise (poly4/9/17) + 16-bit linked channels | ✅ |
| Keyboard input (KBCODE via MachinePlugin.input.codeToKey) | ✅ |
| sendKey held-key tracking + force-release on blur | ✅ (v0.4.0 c5aaf5a) |
| Hardware-config Embind setters (mode/memory/BASIC/kernel) | ✅ (v0.4.0 40e0373) |
| Multi-format loader: XEX / ATR / CAR / CAS | ✅ (v0.4.0 3b73e5d) |
| Pixel format from MachinePlugin.display + RGBA fast path | ✅ (v0.4.0 4bd1338) |
| Dynamic canvas dims + sample rate | ✅ (v0.4.0 7353947, c2dc46b) |
| "Compilation error" overlay when Run is attempted on a failed/blocked build | ✅ (c6fe7a1) |
| Per-step display refresh | ⏳ Frame button workaround — backlog c309619 |
| Hosting | ⏳ Infra epic 70269cc — efc75d1 |

## Debugger — Variables panel (#121)

| Area | State |
|------|-------|
| Phase 1 — flat globals + live raw byte/word values (`labels` + `readMemory`) | ✅ |
| `DebugInfo` port — toolchain-supplied, language-agnostic typed-symbol model (panel never imports a language pkg) | ✅ (ADR-0011, #130) |
| `@madside/lsp-c` type introspection (`typeOfSymbol`/`resolveType`, packed cc65 layout) — the C toolchains fill the port | ✅ (#129) |
| Phase 2 — typed globals + expandable struct/array/pointer tree, value decode by type | ✅ (#130) |
| Watch expressions (`pos.x`, `*ptr`, `arr[3]`, `p->next`) — persisted per project, live | ✅ (#132) |
| Frame/locals contract — `DebugFrame` (memptr/reg) + `DebugScope` + `functionLocals`, `parseDbg` scope/csym parse | ✅ contract + foundation only (ADR-0012, #131) |
| **Locals of current frame** | ❌ deferred — cc65 is frameless (`c_sp` moves, no per-PC delta in dbginfo); reliable path is sccz80 IX (#136), gated on z88dk source-debug (#135) |

## Editor UX

- Tab → 8 spaces (`indentWithTab`), Ctrl/Cmd+S = force assemble + snapshot
- Run/Pause/Stop/Restart on Ctrl+Enter / Ctrl+./Ctrl+Shift+./Ctrl+Shift+Enter (v0.7.0 701373a — moved off F5/Ctrl+R browser-reload collisions)
- F9 toggle BP, F10 step, F11 frame
- Selection visible (mint 25 % / focused 35 %)
- MADS `.lst` parser with include-stack heuristic + path-aware reconstruction
- Autocomplete: opcodes/directives + doc-local labels + project-wide labels (from `.lab`)
- JS autocomplete in converter files via `@codemirror/lang-javascript`

### C / cc65 editor support (GH #1 ecosystem)

> The C intelligence below (completion / hover / go-to-def / references / rename / semantic tokens / diagnostics) is powered by the **in-repo `@madside/lsp-*` C language server** in a Web Worker — `lsp-core` (agnostic framework) + `lsp-c` (generic C engine) + per-dialect engines: `lsp-cc65` (cc65) and `lsp-z80` (sccz80/z88dk ZX Spectrum, #114 — shipped, 25e1e45/25036ee). Migrated from the external `@cc65-intel/*` npm packages per **ADR-0009** (epic #110); the agnostic core proved out: the z80 server dropped in without touching it. Boundary `lsp-core` ⊥ language enforced by lint (868bc7e).

- Syntax highlighting for cc65 C + ca65 assembly via `@codemirror/lang-cpp` (GH #47)
- Autocomplete + hover for cc65 C stdlib / ca65 directives (GH #48), plus cross-file project symbols — the user's own functions/macros, not just stdlib (GH #58, #48)
- Auto-`#include` the matching header when accepting a cc65 completion (GH #48)
- clang-format C formatting via `@wasm-fmt/clang-format` wasm — on Ctrl+S and Format Document (Shift+Alt+F); auto-close brackets + InsertBraces (GH #60)
- Inline C compile errors — cc65 gcc-style `file:line:` diagnostics parse + mark the editor; ld65 ANSI stripped (GH #61)
- Configurable indent (`editor.tabWidth`), manual build trigger (`build.trigger`, manual default), format style (`editor.format`) — all via manifest (GH #59)

## Storage + plugins + history

- Path-based files (binary + text unified)
- Multi-project (new/open/rename/delete/duplicate)
- ZIP export/import via `fflate`
- Content-addressable snapshots, auto-snap 30 s + Ctrl+S, restore/delete dialog
- Snapshot GC + prune (keep last 100 auto-snapshots, manual immune)
- Snapshot diff preview
- Persisted last build per project — OUTPUT + error markers + binary survive a page reload, restored on open (`builds` IDB store, schema v4, GH #62)
- AssetPipelineService: recipes, built-in converters, runAffected skip-aware (49d594d), AssetPanel form + previews
- Plugin editors (Phase 11): contract + registry + Blob-URL loader + reference `bitmap` built-in; three-layer error containment (sync try/catch + React boundary + window error listener)

## Quality / tooling

- ADR-0002 layering enforced by eslint-plugin-boundaries (01c77ab)
- TypeScript project references (9ccb4fa) — incremental layer builds
- Pre-commit: eslint, madge --circular, typecheck, GPG UID guard (fa6ff3a)
- Nix flake devShell — pinned toolchain (d8935a9)
- Vitest + fake-indexeddb; headless workbench tests cover services end-to-end (ADR-0005). The suite spans `src/**/*.test.ts` + `tests/{unit,integration,contract,plugins}/*.test.ts` — RunService wire contract + fast-check property fuzz over the FSM, the StorageBackend contract run against both adapters, and the NES audio end-to-end. Run `npx vitest run` for the current count.
- E2E-ready guardrails: stable testids, URL-loadable project state

## Active work

`gh issue list`. Current milestones use `milestone:v<X.Y.Z>` labels:

- `milestone:v0.8.0` — ✅ **done.** M9 NES validation (epic 8cf0a3b): jsnes emulator backend (b41098c), machine-nes plugin (481d76b), manifest-driven machine selection (1972a36), NES sample in MADS (50e22d1), PPU panel + named memory spaces (93c218b). NES validated via **MADS** (assembles NROM iNES directly); the C/neslib ecosystem later shipped as the cc65/ca65/ld65 toolchain (GH #1 — see C / cc65 ecosystem below).
- `milestone:v0.8.5` — ✅ **done.** Bundled templates (`templates/<id>/` via Vite glob, `src/app/templates.ts`) + welcome picker / File→Templates (71acac1, 505492d).
- `milestone:v0.8.7` — ✅ **done.** Editor language generalization — toolchain+CPU-driven (`@core/cpu/mos6502`, `ToolchainPlugin.language`; 1f08b2c, 6ba97ca, 5ee1a42).
- `milestone:v0.9.0` — ✅ **done.** Visual `project.json` manifest editor (form + raw, f6c22ae) + `build.args`→toolchain wiring (04bdb5a); Astro Starlight docs site under `docs/` (1116ee3) — content for using/extending/reference/meta now written.
- `milestone:v0.9.5` — Courses (epic 2e9c7cc) — **essentially complete**: course format + glob loader + CourseService (3ed11be), lesson→project instantiation (500f11c, 30ba629), declarative check runner (29540fd), entry points + Check wiring (2921c6c) all shipped. Only the course-authoring **docs** child (17bd00e) remains open.
- **C / cc65 ecosystem (GH #1)** — ✅ **shipped.** Second ToolchainPlugin (cc65/ca65/ld65 wasm, `src/plugins/toolchain-ca65`) builds C + ca65 asm for NES (`.nes`) and Atari (`.xex`, GH #52); rides on the VFS mount layer (ADR-0008, GH #55/#56/#57). Full C editor experience: highlight (#47), autocomplete + cross-file completion + auto-`#include` (#48/#58), clang-format formatting (#60), inline compile errors (#61), configurable indent / manual build / format style (#59), persisted last build (#62). Still open: source-level breakpoints C↔6502 (#49), custom build options / linker config (#51), C64 plugin to run cc65 `.prg` (#53).
- **Recent (≈ v0.10–v0.15.x)** — landed since the milestones above; see `gh` + ADRs for detail:
  - **Dockview dockable workbench** (ADR-0010) — named layouts (Desktop/Tablet) + user presets, floating panels, View-menu toggles, touch tuning; legacy splitter + opt-in flag removed. Course switcher in View shown only during a course (#127).
  - **Variables panel epic (#121)** — Phase 1 globals → DebugInfo port (ADR-0011, #129/#130) → typed tree + watch (#132). Locals deferred (cc65 ABI, ADR-0012); z80-via-IX path #136 gated on #135.
  - **`@madside/lsp-z80`** (#114) — sccz80/z88dk ZX Spectrum C server on the agnostic core; `@madside/lsp-c` carved MIT (ADR-0009 epic #110 closed).
  - **Private package extractions** (#123 workbench-core, #125 storage-idb) — clean ADR-0002 layers without publish; #64 reframed (publish gate vs private modularization).
  - Outline / References as own dock panels (#120). Themes-as-plugins scoped as issue #118 (not built).
- `milestone:v1.0.0` — first post-docs major release; TBD
- `milestone:backlog` — Altirra bindings.cpp split (cd90f9d), per-step display refresh research (c309619). IDB schema migration framework shipped (`migrations.ts`): v3 courses store, v4 builds store (#62); BP Map/Record drift test shipped.
- **Infra epic 70269cc** (no milestone, separate clock) — GitHub mirror (edbc165), VPS hosting (efc75d1)

Cancelled: M8 monorepo split (c2f4590) — see [`../decisions/2026-06-12-monorepo-split-cancelled.md`](../decisions/2026-06-12-monorepo-split-cancelled.md).
