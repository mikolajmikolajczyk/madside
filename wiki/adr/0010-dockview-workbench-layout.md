# ADR-0010: Dockview as the workbench layout

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Mikołaj
- **Tags:** architecture, ui, layout, plugins, panels

## Context

madside's workbench UI was a hand-rolled, fixed three-column layout: an Explorer
column, a center editor (with the output panel stacked under it), and a side
column holding the emulator plus a vertically-stacked Debug panel list. Column
widths were drag-resizable through a bespoke `Splitter` + `useSplitterWidth`,
and panel placement was hardcoded by *slot* (`'debug'` column vs the fixed
`'output'` slot) on each `PanelPlugin`.

This fought the plugin-workbench thesis (ADR-0001). Panels are already
contributed by the registry and are open-ended (registers, memory, PPU, and
more coming — symbols, variables #121, …), yet a user could not rearrange them,
hide ones they don't want, or adapt the layout to a different screen. On a
tablet the fixed columns were close to unusable. Every new surface had to be
wired into one of the two hardcoded regions.

The questions this raises:

- **How should surfaces be arranged?** Many plugins, many panels, one
  workbench — the same tension ADR-0001 names, now at the layout.
- **Who owns placement — the app or the user?** A retro IDE benefits from the
  same dock/drag/tab/float freedom mature editors (VS Code, Unity) give.
- **How much do we build ourselves?** The hand-rolled splitter was already
  growing special cases.

## Decision drivers

- **User-arrangeable, not hardcoded.** Drag, dock, split, tab, float, show/hide
  — placement is the user's, persisted across sessions.
- **Fits the existing PanelPlugin registry.** Each registered panel should
  become a layout surface with no change to the panel contract.
- **Don't reinvent docking.** Splitter math, drag-to-dock, tab groups, floating
  windows, serialization — a mature library should provide these.
- **Touch-friendly.** The layout must work on a tablet, not just desktop.
- **Keep panels self-contained.** A panel ships its own UI + styles (the plugin
  thesis); the layout host stays generic.

## Considered options

1. **Keep the bespoke fixed splitter, add toggles/resize ad hoc.** Rejected: the
   special-casing was already accreting, and it can't give drag-to-dock / tabs /
   floating without effectively rebuilding a docking framework.
2. **A different docking library** (rc-dock, FlexLayout, react-mosaic, …).
   Evaluated in the spike (`wiki/spikes/dockview.md`). Rejected relative to
   Dockview on TS-native API, layout serialization, floating windows, and fit.
3. **Dockview as the single layout (chosen).** Each surface is a dockview panel;
   the library owns dock/drag/tab/split/float + serialization.
4. **Dockview behind a flag, legacy kept.** Was the spike's interim state.
   Rejected as the end state: two layouts to maintain, and the dock layout is
   strictly better — committing to one removes the fork (the flag and the legacy
   splitter were deleted).

## Decision outcome

Adopt **Dockview as the workbench's only body layout**. Shape:

- **Surfaces.** The App body content — editor, file tree, emulator, each debug
  `PanelPlugin`, output — is extracted into live React nodes ("surfaces"). A
  thin `DockLayout` hosts each as a dockview panel. Surfaces ride a React
  context (they update every render with app state); a dockview panel carries
  only a stable id, and a `SurfaceHost` resolves the live node. The
  `PanelPlugin` contract is unchanged — panels are rendered through the existing
  `PanelSlot` (ctx wiring + the ADR-0004 error boundary), just hosted in a
  dockview panel instead of a fixed column.

- **Toolbar stays fixed chrome.** MenuBar / DebugBar / StatusBar are *not*
  docked — they frame the dockview body, the way an editor keeps its title/menu
  bars fixed. Panel show/hide, float, layout presets and reset live in a
  MenuBar **View** menu, driven through a small imperative handle
  (`DockControls`).

- **Layouts.** A default arrangement is seeded on first load and on Reset.
  Built-in named layouts (`Desktop`, `Tablet`) ship in code as serialized
  dockview JSON. Users save their own presets (persisted to localStorage) and
  can copy the current layout as JSON. The working layout persists across
  sessions.

- **The `PanelPlugin.slot` hint becomes a default-placement seed**, not a hard
  region — users then rearrange freely.

Boundaries restated so they can't drift:

> The layout is a **view that arranges surfaces**, not where panels live. A
> panel owns its content + styles in its own package (cf. panel-output, and the
> registers/memory/ppu styles now co-located there); the host provides only the
> generic dock frame. Colours come from the host design tokens (the theme
> contract — see the themes-as-plugins follow-up #118). The toolbar is chrome,
> never a dock panel.

Consequences for the codebase (already landed on `main`):

- New `DockLayout` + surface model in `apps/ide/src/ui/dock/`; a
  `dockview-theme-madside` mapping dockview `--dv-*` onto design tokens.
- The `VITE_MADSIDE_DOCKVIEW` flag and the legacy layout are gone: the bespoke
  `Splitter`, `useSplitterWidth`, the `Debug` column component, and the
  `.app__body/__main/__side` CSS were deleted (~270 net lines removed).
- Panel CSS moved into the panel packages (self-contained plugins).

## Consequences

**Positive**

- Users arrange the workbench freely (dock/drag/tab/split/float/hide) and the
  layout persists; presets + built-in `Desktop`/`Tablet` layouts.
- New panels (symbols, variables #121, …) drop in as surfaces with zero layout
  wiring — they appear via the registry + a View-menu toggle.
- Tablet-usable, which the fixed columns were not.
- One layout, no fork; ~270 fewer lines than the bespoke splitter it replaced.
- A clean seam for the deferred work: themes-as-plugins (#118), Outline/refs as
  their own panels (#120), memory panel filling its height (#119).

**Negative / risks**

- A third-party dependency (`dockview`) now owns core UX. Mitigation: it's
  TS-native, actively maintained, and the surface model keeps our code thin.
- Bundle cost — dockview JS + a CSS that currently ships all themes. Follow-up:
  import one theme + lazy-load the layout chunk before this is a concern at
  scale (tracked with #118).
- Size-sensitive content (CodeMirror, the emulator canvas) must re-measure when
  a panel is resized or revealed — handled by a coalesced resize nudge in
  `SurfaceHost`, but it's an integration point to keep in mind for future
  surfaces.
- `debug__panel` / `debug__title` chrome is duplicated across the registers /
  memory / ppu packages (kept independent over DRY). Extract a shared panel-ui
  stylesheet/package if it grows.

Relates to ADR-0001 (plugin workbench — this is its layout), ADR-0002
(layering — host arranges, packages own content), ADR-0004 (panel error
boundaries, reused). Spike write-up: `wiki/spikes/dockview.md`.
