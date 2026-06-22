# Spike: Dockview — dockable, rearrangeable IDE layout

**Branch:** `spike/dockview-layout` (worktree `../madside-dockview`) · **Status:** spike (throwaway, not merged) · **Date:** 2026-06-22

## Question

Can madside get a VS-Code/Unity-style layout — panels you drag, dock, split,
tab, toggle on/off, and whose arrangement persists — without rewriting the
plugin model? Which library?

## Outcome: Dockview is a fit. Recommend an ADR + phased adoption.

Built behind `VITE_MADSIDE_DOCKVIEW=1` (run `VITE_MADSIDE_DOCKVIEW=1 pnpm dev`).
App.tsx is untouched; `main.tsx` swaps the root to `DockSpike` when the flag is
set. Files: `apps/ide/src/ui/dock/DockSpike.{tsx,css}`.

### What the spike proves

- **Every existing `PanelPlugin` hosts unchanged.** One dockview component
  (`PanelHost`) routes by `params.panelId` through the existing `PanelSlot` —
  so ctx wiring (events/commands/debug/machine) + the Level-2 error boundary
  (ADR-0004) come for free. The registry (`workbench.plugins.list('panel')`)
  maps 1:1 to dockview panels. No panel code changed.
- **Vanilla `mount(container)` panels work** inside a dockview panel (the
  Blob-URL sandboxed plugin path, Phase 11) — verified with a `spike-vanilla`
  test panel. PanelSlot's container lifecycle is dockview-agnostic.
- **Drag / split / tab / float** — all native to dockview, zero custom code.
- **Toggle on/off** — checkbox bar adds/removes panels via `api.addPanel` /
  `panel.api.close()`.
- **Layout serializes + resets** — `api.toJSON()` → localStorage on
  `onDidLayoutChange`; `api.fromJSON()` on load; reset re-seeds a default. In
  production this persists per-project via `StorageBackend`.

### Fit with the architecture

- Slots in well with ADR-0001 (plugin workbench) + the Panel contract. The
  hand-rolled layout (`Splitter`, `clampExplorer`/`clampSide`, fixed
  `debug`/`output` slots in `App.tsx`) is what gets replaced — the panels
  themselves don't.
- The `slot` hint on PanelPlugin (`'debug'` vs `'output'`) becomes a *default
  position* seed, not a hard placement — users then rearrange freely.
- Editor + Explorer are non-panel surfaces; in the spike they're placeholders.
  Real adoption makes them dockview panels too (Explorer already is a clean
  component; the editor is heavier — multiple editor tabs become a real design
  question, see open questions).

### Cost / caveats

- **Bundle:** dockview ~40 KB JS (source) + a 112 KB CSS that ships **all 10
  themes**. Production: import one theme only + lazy-load the layout shell →
  modest. Spike bundles it eagerly into the index chunk.
- **Theme:** dockview ships its own theme classes (`dockview-theme-*`); spike
  uses `abyss`. Matching madside's design tokens means a custom theme or CSS
  variable overrides — real work, not free.
- **Editor multiplicity:** today there's one center editor. Dockview invites
  multiple editor tabs/groups — that's a feature *and* a model change (active
  file vs N open files, breakpoint/source-map model is single-file today).
  Scope it deliberately; don't let docking drag multi-editor in by accident.
- **StrictMode:** dockview double-mount under React 19 StrictMode worked in the
  spike, but watch layout-restore effects on real adoption.

## Recommendation

1. Cut an ADR ("workspace/layout model") extending ADR-0001 — panels get
   user-arrangeable placement + a persisted workspace layout.
2. Phase it: (a) dock the existing debug/output/panel column behind the flag
   with per-project layout persistence; (b) fold Explorer in; (c) decide the
   multi-editor question separately.
3. Single theme + lazy chunk before default-on.

Alternatives considered: **rc-dock** (solid, weaker API/theming),
**FlexLayout** (mature, dated), **react-mosaic** (tiling only, no tabbed
docking), **allotment/react-resizable-panels** (splits only — too little).
Dockview won on TS-native API, serialization, floating windows, and fit.
