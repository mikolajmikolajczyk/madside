---
title: Panels
description: Register/memory/PPU-style viewers, and how they read live service state.
sidebar:
  order: 5
---

A **panel** is a generic UI surface in the workbench — the register viewer, the memory viewer, an ANTIC/PPU/GTIA viewer, a symbol browser, even a file editor. They all implement one contract, `PanelPlugin`.

Panels are **built-in only** today — they register at startup, not per-project.

## The contract

Source: `@ports/plugin-panel.ts`. A `PanelPlugin` is a tagged union: exactly one of `Component` (React) or `mount` (vanilla DOM) is set.

```ts
type PanelPlugin =
  | (PanelPluginBase & { readonly Component: PanelComponent; readonly mount?: undefined })
  | (PanelPluginBase & { readonly mount: PanelMount; readonly Component?: undefined })

interface PanelPluginBase {
  readonly kind: 'panel'
  readonly id: string
  readonly title: string
  slot?: 'debug' | 'output'                    // placement: 'debug' (default, movable column) | 'output' (fixed slot above editor)
  supports?(machine: MachinePlugin): boolean   // false ⇒ hide for the active machine
  fileExt?: readonly string[]                  // present ⇒ this panel is a file editor for these exts
}

type PanelComponent = ComponentType<{ ctx: PanelContext }>
type PanelMount = (container: HTMLElement, ctx: PanelContext) => { destroy: () => void }
```

Both render paths receive a `PanelContext`:

```ts
interface PanelContext {
  events: EventBus
  commands: CommandRegistry
  debug: DebugService          // debug.target() returns the live DebugTarget once booted
  project: { id: string; manifest: ProjectManifestV2 }
  machine: MachinePlugin
  data: Record<string, unknown>  // host-provided UI-state slot (loose for now)
  file?: { value, path, onChange, assets }  // present only in file-editor mode
}
```

- **React `Component`** — the path built-in panels use. The workbench renders `<panel.Component ctx={ctx} />`.
- **Vanilla `mount(container, ctx)`** — the path for sandboxed external panels loaded via Blob URL; you get a DOM container and return a `destroy` callback.

`supports(machine)` gates availability — return `false` to hide the panel for the active machine (e.g. an ANTIC viewer on a NES project).

## Hello-world — React component

```tsx
import type { PanelPlugin } from '@ports'
import { useEffect, useState } from 'react'

export const ticksPanel: PanelPlugin = {
  id: 'ticks',
  title: 'Steps',
  Component: ({ ctx }) => {
    const [n, setN] = useState(0)
    useEffect(() => ctx.events.on('debug:step-done', () => setN((x) => x + 1)), [ctx.events])
    return <div className="debug__panel">step count: {n}</div>
  },
}
```

Register it and list it in the manifest:

```ts
plugins.register({ plugin: { ...ticksPanel, kind: 'panel' }, source: { origin: 'builtin' } })
```

```jsonc
{ "version": 2, "panels": ["registers", "memory", "ticks"] }
```

Panels are resolved via `manifest.panels` → the machine's `defaultPanels` → a fallback set. Adding one is a module + a manifest entry; the debugger host iterates the list and renders a slot per id with zero panel-specific code.

Placement is driven by `slot`. Omit it (or set `'debug'`) and the panel lands in the movable debug column; set `'output'` and it goes into the fixed full-width slot above the editor — that's how the built-in **Output** panel (`packages/panel-output/`) is placed. No panel id is special-cased; the host places each panel purely by its slot.

## Hello-world — vanilla mount

```ts
import type { PanelPlugin } from '@ports'

export const heartbeat: PanelPlugin = {
  id: 'heartbeat',
  title: 'Heartbeat',
  mount(container, ctx) {
    const node = document.createElement('div')
    node.textContent = 'waiting…'
    container.appendChild(node)
    const off = ctx.events.on('debug:step-done', (p) => {
      node.textContent = `PC = ${p.pc.toString(16)}`
    })
    return { destroy() { off(); container.innerHTML = '' } }
  },
}
```

## Reading service state (the sync rule)

Panels are **views, never owners**. This is the single most important rule for a panel author (ADR-0007):

> Each domain (run, debug, build, project, file) has a service-owned state machine that emits exactly one typed event per transition. A panel subscribes to the event and reads from the service. Never mirror service state in `useState`.

```tsx
// good — subscribe + read the value the event carries
Component: ({ ctx }) => {
  const [pc, setPc] = useState<number | null>(null)
  useEffect(() => ctx.events.on('debug:step-done', (p) => setPc(p.pc)), [ctx.events])
  return <code>PC = {pc?.toString(16) ?? '—'}</code>
}

// bad — a parallel React source for a service-owned concept
const [running, setRunning] = useState(false) // RunService.status is the truth
```

For the run lifecycle specifically, the host hook is `useRunStatus()` (from `@ui/hooks`). The events a panel typically subscribes to:

| Event | When |
|-------|------|
| `debug:step-done` | A step / step-frame completed |
| `debug:bp-hit` | Breakpoint trapped during run |
| `run:state` | RunService status changed (loaded, running, paused) |
| `build:done` / `build:error` | BuildService finished |
| `project:switched` | Active project changed |
| `file:changed` | File-tree write |

See `@ports/event-bus.ts` for the complete typed map, and the architecture guide for [the sync rule in context](/docs/extending/architecture/#the-serviceui-sync-rule-adr-0007). Reference implementations: `packages/panel-registers/` and `packages/panel-memory/`.

## Memory spaces

A generic memory viewer reads named address spaces through `ctx.debug.target().readMemory(addr, len, space)`. The CPU bus (`'cpu'`) is implicit; machines declare extra spaces (e.g. NES `ppu` / `oam`) in their `MachinePlugin.memorySpaces`. A panel reads a space by passing its id — the backend serves it. This is how a PPU/sprite/tile viewer works without the core knowing anything about the device. See [Machine plugins](/docs/extending/machine/#memory-spaces) and the [Reference](/docs/reference/) memory-space table.

## File-editor mode

A panel with a `fileExt` array doubles as a file editor: when a matching file is opened, the workbench routes it through this panel and populates `ctx.file` with `{ value, path, onChange, assets }`. This is how the [editor](/docs/extending/editor/) contract folds into `PanelPlugin`.

## Error containment

Panel crashes don't propagate to the App root. The host wraps mount in a layered error trap (sync `try/catch` + React error boundary + window-level `error`/`unhandledrejection` listeners). The fallback names the offending plugin and offers "Reload".
