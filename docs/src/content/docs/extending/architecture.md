---
title: Architecture in brief
description: Layers, the event bus, services, and the service↔UI sync rule plugins follow.
sidebar:
  order: 2
---

You don't need the whole architecture to write a plugin — but two things shape every plugin: the **layer** your code lives in, and the **service↔UI sync rule** that panels follow. This page is a quick orientation; deeper material lives in the project ADRs.

## Layers

madside is layered with a strict dependency direction (ADR-0002, enforced by ESLint):

```
core      → pure utilities, zero side effects
ports     → interfaces only (the plugin contracts live here)
adapters  → port implementations (storage, plugin loader, emulator backend)
services  → workbench-core services (Build, Run, Debug, AssetPipeline)
plugins   → built-in plugin instances
app       → wiring (createWorkbench)
ui        → React tree + hooks
```

**Plugin code lives in `plugins` and may import `ports` + `core` only** — never `adapters`, `services`, `app`, or `ui`. The contracts you implement are all in `ports` (`@ports/plugin-*.ts`). This is what keeps the core machine-agnostic: a panel imports the `PanelPlugin` type and the `EventBus` interface, not the concrete services.

**Hard rule:** UI talks to services; services talk to plugins; UI never imports a plugin or hardware-specific module.

## The event bus

The workbench has one typed pub/sub `EventBus`. Services emit on it; UI and panels subscribe. The full typed map lives in `@ports/event-bus.ts`; the events a plugin author cares about:

| Event | When |
|-------|------|
| `debug:step-done` | A step / step-frame completed |
| `debug:bp-hit` | A breakpoint trapped during run |
| `run:state` | RunService status changed (loaded, running, paused, …) |
| `build:done` / `build:error` | BuildService finished |
| `project:switched` | The active project changed |
| `file:changed` | A file-tree write |

Subscribing returns an unsubscribe disposer:

```ts
const off = ctx.events.on('debug:step-done', (p) => { /* p.pc, … */ })
// later: off()
```

## Services

Three services own the lifecycles a plugin observes:

- **BuildService** — resolves `manifest.toolchain` → your `ToolchainPlugin.build()`, emits `build:done` / `build:error`.
- **RunService** — emulator lifecycle (load / run / pause / reset) over the `RunBackend`, owns `status`, emits `run:state`.
- **DebugService** — wraps the active `DebugAdapter`; `debug.target()` returns the live `DebugTarget` once a backend is booted. Emits `debug:step-done` / `debug:bp-hit`.

Panels receive these on `ctx` (events, commands, debug, project, machine) — see the [panel guide](/docs/extending/panel/).

## The service↔UI sync rule (ADR-0007)

This is the one rule a panel author must internalise:

> Every domain (run, debug, build, project, file) has exactly one finite state machine, owned by its service. Every transition emits exactly one typed event on the `EventBus`. UI reads state by subscribing to that event and reading from the service — it never holds parallel React state for the same concept.

Concretely, the host exposes a `subscribe(listener)` + a read-only `status` getter per service, and the UI wraps them in a `useSyncExternalStore` hook (e.g. `useRunStatus()`). For a panel:

```tsx
// good — subscribe to the event, read the value the event signals
Component: ({ ctx }) => {
  const [pc, setPc] = useState<number | null>(null)
  useEffect(() => ctx.events.on('debug:step-done', (p) => setPc(p.pc)), [ctx.events])
  return <code>PC = {pc?.toString(16) ?? '—'}</code>
}

// bad — a second source of truth for a service-owned concept
const [running, setRunning] = useState(false) // RunService.status is the truth
```

Mirroring a service-owned status in `useState`, or reading the backend directly from a component, is the bug class ADR-0007 exists to kill. Panels are **views**, never owners.

## Plugin host (where your code runs)

Heavy plugins don't all run on the main thread. The workbench assigns a host per kind (ADR-0003): toolchains run in a dedicated worker per build, converters in a shared worker pool, while panels, editors, machines, emulators (v1), and debug adapters run on main. You write against a uniform `await`-based call shape regardless of host — the workbench handles the transport. This matters mostly for converters and toolchains: keep them pure / serialisable (bytes in, bytes out), no DOM, no closures over the wire.

Deeper reading: ADR-0001 (plugin taxonomy), ADR-0002 (layering), ADR-0003 (host model), ADR-0007 (service↔UI sync) in the project wiki.
