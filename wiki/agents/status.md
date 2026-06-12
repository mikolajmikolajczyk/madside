# Feature status (current)

> Snapshot of what works today. Roadmap and active issues live in Radicle (`rad issue list --all`).

## Core stack

| Area | State |
|------|-------|
| Vite + React + TS skeleton | ✅ |
| CodeMirror 6 + custom MADS stream highlighter | ✅ (no Lezer grammar yet — deferred) |
| `mads.wasm` bundled in `public/wasm/` (1.9 MB) | ✅ |
| WASI shim via `@bjorn3/browser_wasi_shim` | ✅ |
| `BuildService.build()` dispatched by `manifest.toolchain` id | ✅ (v0.5.0 443eaed) |
| Auto-assemble (debounce 400 ms + race guard) | ✅ — binary committed to emu only on Run |
| Layout: toolbar / [explorer \| editor+output \| emulator+debug side panel] | ✅ resizable splitter, persisted |

## Workbench core (services + plugins)

| Area | State |
|------|-------|
| BuildService / RunService / DebugService / AssetPipelineService | ✅ (M3, v0.3.0) |
| EventBus + CommandRegistry + unified PluginRegistry | ✅ (M3) |
| Headless `createWorkbench()` factory (DOM-free, tests use memory adapters) | ✅ |
| project.json v2 schema + validator (`parseProjectManifest`) | ✅ (v0.5.0 443eaed) |
| MachinePlugin port + Atari-XL first impl | ✅ (v0.4.0 a6c310d) |
| ToolchainPlugin port + MADS first impl + manifest-driven dispatch | ✅ (v0.5.0 87f03ad + 443eaed) |
| DebugAdapterPlugin port + atari-6502 first impl | ✅ (v0.6.0 2810a62) |
| PanelPlugin port + 3 built-in panels (registers/memory/output) | ✅ (v0.7.0 5ddf99e) |
| Event-driven panel refresh via ctx.events / ctx.debug | ✅ (v0.7.0 ba1a27b) |
| FileEditor (Phase 11) folded into PanelPlugin via editorToPanel | ✅ (v0.7.0 6f2dc20) |
| Plugin contract test harnesses under `@ports/test/` | partial — Toolchain ✅ (51e047c); Machine drift test ✅; Debug/Panel pending |
| Plugin author docs under `wiki/plugin-api/` | ✅ (v0.7.0 a7b79c0) |
| Service ↔ UI sync FSM + EventBus + useSyncExternalStore (ADR-0007) | ✅ (v0.7.5 M7.5 epic 152abfd — Run lifecycle reference impl, contract test, dev event logger, property fuzz) |
| EmulatorPlugin contract | ⏳ M4 follow-up |

## Emulator (Altirra wasm)

| Area | State |
|------|-------|
| Altirra core via fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed` | ✅ — `src/adapters/emu/wasm/altirra-core.{wasm,js}` ≈ 4.6 MB + 133 KB; Vite-tracked |
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
| Per-step display refresh | ⏳ Frame button workaround — backlog c309619 |
| Hosting | ⏳ Infra epic 70269cc — efc75d1 |

## Editor UX

- Tab → 8 spaces (`indentWithTab`), Ctrl/Cmd+S = force assemble + snapshot
- Run/Pause/Stop/Restart on Ctrl+Enter / Ctrl+./Ctrl+Shift+./Ctrl+Shift+Enter (v0.7.0 701373a — moved off F5/Ctrl+R browser-reload collisions)
- F9 toggle BP, F10 step, F11 frame
- Selection visible (mint 25 % / focused 35 %)
- MADS `.lst` parser with include-stack heuristic + path-aware reconstruction
- Autocomplete: opcodes/directives + doc-local labels + project-wide labels (from `.lab`)
- JS autocomplete in converter files via `@codemirror/lang-javascript`

## Storage + plugins + history

- Path-based files (binary + text unified)
- Multi-project (new/open/rename/delete/duplicate)
- ZIP export/import via `fflate`
- Content-addressable snapshots, auto-snap 30 s + Ctrl+S, restore/delete dialog
- Snapshot GC + prune (keep last 100 auto-snapshots, manual immune)
- Snapshot diff preview
- AssetPipelineService: recipes, built-in converters, runAffected skip-aware (49d594d), AssetPanel form + previews
- Plugin editors (Phase 11): contract + registry + Blob-URL loader + reference `bitmap` built-in; three-layer error containment (sync try/catch + React boundary + window error listener)

## Quality / tooling

- ADR-0002 layering enforced by eslint-plugin-boundaries (01c77ab)
- TypeScript project references (9ccb4fa) — incremental layer builds
- Pre-commit: eslint, madge --circular, typecheck, GPG UID guard (fa6ff3a)
- Nix flake devShell — pinned toolchain (d8935a9)
- Vitest + fake-indexeddb; headless workbench tests cover services end-to-end (ADR-0005). 85 tests passing across `src/**/*.test.ts` + `tests/{integration,contract,plugins}/*.test.ts` — RunService wire contract + fast-check property fuzz over the FSM landed in v0.7.5.
- E2E-ready guardrails: stable testids, URL-loadable project state (7659319)

## Active work

`rad issue list`. Current milestones use `milestone:v<X.Y.Z>` labels:

- `milestone:v0.8.0` — M9 NES validation (epic 8cf0a3b): jsnes emulator pick + backend skeleton (b41098c ✅), machine-nes plugin (481d76b), NES sample in MADS (50e22d1), PPU panel (93c218b). NES validated via **MADS** (assembles NROM iNES directly — proven b41098c); ca65 (6bed971) deferred to backlog as a future second toolchain for the C/neslib ecosystem.
- `milestone:v0.9.0` — Astro Starlight docs site (1116ee3) — sequenced after two working platforms (Atari + NES) exist to document
- `milestone:v1.0.0` — first post-docs major release; TBD
- `milestone:backlog` — BP Map/Record drift (609be37), IDB schema migration framework (18ac6a7), Altirra bindings.cpp split (cd90f9d), per-step display refresh research (c309619), ca65/ld65 wasm toolchain for C/neslib ecosystem (6bed971)
- **Infra epic 70269cc** (no milestone, separate clock) — GitHub mirror (edbc165), VPS hosting (efc75d1)

Cancelled: M8 monorepo split (c2f4590) — see [`../decisions/2026-06-12-monorepo-split-cancelled.md`](../decisions/2026-06-12-monorepo-split-cancelled.md).
