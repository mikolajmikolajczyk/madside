# Feature status (current)

> Snapshot of what works today. Roadmap and active issues live in Radicle (`rad issue list --all`). This page is intentionally informal.

## Core stack

| Area | State |
|------|-------|
| Vite + React + TS skeleton | ✅ |
| CodeMirror 6 + custom MADS stream highlighter | ✅ (no Lezer grammar yet — deferred) |
| `mads.wasm` bundled in `public/wasm/` (1.9 MB) | ✅ |
| WASI shim via `@bjorn3/browser_wasi_shim` | ✅ |
| `BuildService.build()` via ToolchainPlugin (MADS first impl) | ✅ (v0.5.0 ea35144) |
| Auto-assemble (debounce 400 ms + race guard) | ✅ — binary committed to emu only on Run |
| Layout: toolbar / [explorer \| editor+output \| emulator+debug side panel] | ✅ resizable splitter, persisted |

## Workbench core (services + plugins, v0.3.0 / v0.4.0 / v0.5.0)

| Area | State |
|------|-------|
| BuildService / RunService / DebugService / AssetPipelineService | ✅ (M3, v0.3.0) |
| EventBus + CommandRegistry + unified PluginRegistry | ✅ (M3) |
| Headless `createWorkbench()` factory (DOM-free, tests use memory adapters) | ✅ |
| MachinePlugin port + Atari-XL first impl | ✅ (v0.4.0 a6c310d) |
| ToolchainPlugin port + MADS first impl | ✅ (v0.5.0 ea35144) |
| Manifest-driven plugin selection (project.json v2) | ⏳ open — 0897b06 |
| EmulatorPlugin / DebugAdapter / PanelPlugin contracts | ⏳ M4-follow / M6 / M7 |

## Emulator (Altirra wasm)

| Area | State |
|------|-------|
| Altirra core via fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed` | ✅ — `src/adapters/emu/wasm/altirra-core.{wasm,js}` ≈ 4.6 MB + 133 KB; Vite-tracked |
| Altirra OS kernel | ✅ built into wasm core (no external ROM file) |
| Run / pause / step (1 instruction) / frame / reset | ✅ |
| Source-level breakpoints (gutter click, persist across reassemble, IDB schema v2) | ✅ |
| Active-PC line highlight in editor | ✅ |
| Addr gutter (4-hex per emitting line) | ✅ |
| CPU state (registers + flags) | ✅ live on pause/break |
| Memory view (128 B, hex input, auto load-addr default, follows cursor, machine.memoryMap regions) | ✅ (7f0c7f4) |
| POKEY audio via AudioWorklet | ✅ (27fa821 migrated from ScriptProcessorNode) |
| POKEY polynomial noise (poly4/9/17) + 16-bit linked channels | ✅ |
| Keyboard input (KBCODE via MachinePlugin.input.codeToKey) | ✅ (33eb166) |
| sendKey held-key tracking + force-release on blur | ✅ (c5aaf5a) |
| Hardware-config Embind setters (mode/memory/BASIC/kernel) | ✅ (40e0373) |
| Multi-format loader: XEX / ATR / CAR / CAS | ✅ (3b73e5d) |
| Pixel format from MachinePlugin.display + RGBA fast path | ✅ (4bd1338) |
| Dynamic canvas dims + sample rate | ✅ (7353947, c2dc46b) |
| Per-step display refresh | ⏳ Frame button workaround — backlog c309619 |
| Hosting | ⏳ v0.8.0 efc75d1 |

## Editor UX

- Tab → 8 spaces (`indentWithTab`), Ctrl/Cmd+S = force assemble (global)
- Selection visible (mint 25 % / focused 35 %)
- MADS `.lst` parser with include-stack heuristic
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
- Plugin editors (Phase 11): contract + registry + Blob-URL loader + reference `bitmap` built-in for `.1bpp`/`.bmp1`

## Quality / tooling

- ADR-0002 layering enforced by eslint-plugin-boundaries (01c77ab)
- TypeScript project references (9ccb4fa) — incremental layer builds
- Pre-commit: eslint, madge --circular, typecheck, GPG UID guard (fa6ff3a)
- Nix flake devShell — pinned toolchain (d8935a9)
- Vitest + fake-indexeddb; headless workbench tests cover services end-to-end (ADR-0005)
- E2E-ready guardrails: stable testids, URL-loadable project state (7659319)

## Active work

Look at Radicle: `rad issue list`. Current milestones use `milestone:v<X.Y.Z>` labels:

- `milestone:v0.5.0` — M5 ToolchainPlugin + project.json v2 (open: 0897b06, 6ede5d8, 787075c, 771ce79)
- `milestone:v0.6.0` — M6 DebugAdapter
- `milestone:v0.7.0` — M7 PanelPlugin
- `milestone:v0.8.0` — M8 Monorepo + hosting + GitHub mirror
- `milestone:v0.9.0` — Phase 13 docs (Astro Starlight, 1116ee3)
- `milestone:v1.0.0` — M9 NES validation
- `milestone:backlog` — IDB schema framework, Altirra bindings split, per-step display refresh, BP Map/Record drift
