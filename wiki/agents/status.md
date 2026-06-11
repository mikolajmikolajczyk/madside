# Feature status (current)

> Snapshot of what works today. Roadmap and active issues live in Radicle (`rad issue list --all`). This page is intentionally informal.

## Core stack

| Area | State |
|------|-------|
| Vite + React + TS skeleton | ✅ |
| CodeMirror 6 + custom MADS stream highlighter | ✅ (no Lezer grammar yet) |
| `mads.wasm` bundled in `public/wasm/` (1.9 MB) | ✅ |
| WASI shim via `@bjorn3/browser_wasi_shim` | ✅ |
| `assemble(main, files)` → `{ok, xex, lst, lab, stdout, stderr}` | ✅ |
| Auto-assemble (debounce 400 ms + race guard via seq counter) | ✅ — xex committed to emu only on Run |
| Layout: toolbar / [explorer \| editor+output \| emulator+debug side panel] | ✅ vertical right-side panel |

## Emulator (Altirra wasm, Phase 12)

| Area | State |
|------|-------|
| Altirra (Avery Lee) wasm core via fork `mikolajmikolajczyk/AltirraSDL` branch `madside-embed` | ✅ — `src/adapters/emu/wasm/altirra-core.{wasm,js}` ≈ 4.6 MB + 133 KB; Vite-tracked |
| Altirra OS kernel | ✅ built into wasm core (no external ROM file) |
| Run / pause / step (1 instruction) / frame / reset | ✅ |
| Source-level breakpoints (gutter click, persist across reassemble) | ✅ label lines resolve to next emitting line |
| Active-PC line highlight in editor | ✅ |
| Addr gutter (4-hex per emitting line) | ✅ |
| CPU state (registers + flags) | ✅ live on pause/break |
| Memory view (128 B, hex base input, auto-defaults to xex load addr, auto-follows cursor) | ✅ highlights cursor source-line bytes |
| POKEY audio (Altirra core POKEY → `IATAudioTap` → JS `ScriptProcessorNode`) | ✅ |
| Keyboard input (POKEY KBCODE via `PushKey` / `ReleaseAllRawKeys`) | ✅ |
| Per-step display refresh | ⏳ M2 research — Frame button is workaround |
| ATR disk loader | ⏳ M2 — no SIO disk drive wired yet |
| Hosting | ⏳ pick GitHub Pages or Vercel |

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
- Asset pipeline (Phase 7): recipes, built-in converters, AssetPanel form + previews
- Plugin editors (Phase 11): contract + registry + Blob-URL loader + reference `bitmap` built-in for `.1bpp`/`.bmp1`

## Recently shipped (rapid-fixes / cleanup)

- Hooks split from App.tsx (824 → 539 lines)
- Utility dedupe under `src/lib/util/`
- POKEY polynomial noise (poly4/9/17)
- POKEY 16-bit linked channels (CH1_CH2 / CH3_CH4)
- Resizable side panel splitter (persisted)
- Breakpoints persist across refresh (IDB schema v2)
- Code-splitting bundle (~223 KB main gzip, down from ~293)
- Source map: lines with `FFFF>` / `XXXX-XXXX>` prefixes
- Auto-pause one instruction before BP fires
- Frame-step reuses step's snapshot/no-cpu trick

## Active work

Look at Radicle: `rad issue list` (current open). Milestone labels:

- `milestone:m2` — finish Atari Phase 12 M2 (13 issues)
- `milestone:m2-5-foundation` — architectural cleanup (16 issues)
- `milestone:m3-services` — services + plugin registry (16 issues)
- `milestone:m4-machine-plugin` (6) / `m5-toolchain-plugin` (4) / `m6-debug-adapter` (2) / `m7-panel-plugins` (5)
- `milestone:m8-monorepo` (1) / `m9-nes` (5)
- `milestone:phase-13` — Astro Starlight docs (1)
