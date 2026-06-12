# PanelPlugin

> Source: [`src/ports/plugin-panel.ts`](../../src/ports/plugin-panel.ts). Built-in panels: [`src/plugins/panel-registers/`](../../src/plugins/panel-registers/), [`src/plugins/panel-memory/`](../../src/plugins/panel-memory/), [`src/plugins/panel-output/`](../../src/plugins/panel-output/).

Generic UI surface. Memory viewer, register viewer, ANTIC/PPU/GTIA viewers, symbol browser, file editor — all PanelPlugin.

## Contract

```ts
type PanelPlugin =
  | { id, title, supports?, fileExt?, Component: React.ComponentType<{ ctx: PanelContext }>, mount?: undefined }
  | { id, title, supports?, fileExt?, mount: (container, ctx) => { destroy }, Component?: undefined }

interface PanelContext {
  events: EventBus
  commands: CommandRegistry
  debug: DebugService          // .target() returns DebugTarget when booted
  project: { id, manifest }
  machine: MachinePlugin
  data: Record<string, unknown>  // host-provided UI state slot
  file?: { value, path, onChange, assets }  // present only in file-editor mode
}
```

Two render paths:
- **React Component** — built-in panels. Workbench renders `<panel.Component ctx={ctx} />`.
- **Vanilla `mount(container, ctx)`** — sandboxed Phase 11-style plugins loaded via Blob URL + dynamic `import()`. Workbench gives the plugin a DOM container; the plugin returns a `destroy` callback.

`supports(machine)` gates availability — return `false` to hide for the active MachinePlugin.

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

Register + project manifest:

```ts
plugins.register({ plugin: { ...ticksPanel, kind: 'panel' }, source: { origin: 'builtin' } })
```

```jsonc
{ "version": 2, "panels": ["registers", "memory", "ticks"], ... }
```

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

This is the path used by Phase 11 file editors (`editors/*.js`) after the cae0633 generalisation. Project-side plugins shadow built-ins by id.

## How panels stay in sync

Panels are **views**, never owners. Each domain (run, debug, build, project, file) has a service-owned FSM that emits exactly one typed event per transition (ADR-0007). Panel subscribes to the event + reads from the service. Never mirror service state in `useState`.

```tsx
// good — subscription + service read
Component: ({ ctx }) => {
  const [pc, setPc] = useState<number | null>(null);
  useEffect(() => ctx.events.on('debug:step-done', (p) => setPc(p.pc)), [ctx.events]);
  return <code>PC = {pc?.toString(16) ?? '—'}</code>;
}

// bad — parallel React state for a service-owned concept
const [running, setRunning] = useState(false); // RunService.status is the truth
```

For run lifecycle specifically, host hook is `useRunStatus()` (from `@ui/hooks`) — panels can read it directly via `ctx` injection or subscribe to `run:state` themselves. See `src/plugins/panel-registers/` and `src/plugins/panel-memory/` for canonical implementations.

## Event-driven data flow

Built-in panels subscribe to workbench events instead of receiving props:

| Event | When |
|-------|------|
| `debug:step-done` | DebugService.step / stepFrame |
| `debug:bp-hit` | Breakpoint trap during run |
| `run:state` | RunService status changes (loaded, running, paused) |
| `build:done` / `build:error` | BuildService finished |
| `project:switched` | Active project changed |
| `file:changed` | File tree write |

See [`@ports/event-bus.ts`](../../src/ports/event-bus.ts) for the complete typed map.

## Error containment

Panel crashes don't propagate to App root — PluginEditor wraps mount in a layered error trap (sync try/catch + React error boundary + window-level error/unhandledrejection listeners). Fallback names the offending plugin and offers "Reload editor". See commit `a6152af`.

## Notes

- `data` is a loose `Record<string, unknown>` for v0.7.0. Typed per-panel data slots arrive when the built-in panel set stabilises.
- Panels are looked up via `manifest.panels` → `machine.defaultPanels` → fallback. Adding `panel-symbols` is a module + manifest entry; no `Debug.tsx` change.
- Vanilla-mount external panels load through `createPluginLoader` (Blob URL + dynamic import + sha256 cache). Same loader as converters and Phase 11 editors.
