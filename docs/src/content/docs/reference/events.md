---
title: Events
description: The typed workbench event bus map.
sidebar:
  order: 7
---

Services and plugins communicate over a typed event bus. Plugins receive an
`EventBus` via their context; services subscribe directly. The map is open —
new layers can augment `WorkbenchEvents` by declaration merging.

## Events

| Event | Payload | When emitted |
|-------|---------|--------------|
| `build:start` | `{ projectId }` | A build begins. |
| `build:done` | `{ projectId, result: BuildResult }` | A build finishes successfully. |
| `build:error` | `{ projectId, message }` | A build fails. |
| `run:state` | `{ status, prev }` | The run FSM transitions. Both fields are one of `idle`, `loaded`, `running`, `paused`, `crashed`. |
| `debug:bp-hit` | `{ pc }` | Execution hits a breakpoint. |
| `debug:step-done` | `{ pc }` | A step (instruction or frame) completes. |
| `project:switched` | `{ projectId }` | The active project changes. |
| `file:changed` | `{ path }` | A file's contents change. |
| `recipes:start` | `{ projectId }` | The asset pipeline begins running recipes. |
| `recipes:done` | `{ projectId, updated: string[] }` | The asset pipeline finishes; `updated` lists output paths that changed. |
| `plugin:crashed` | `{ pluginId, kind, cause }` | A plugin throws. `kind` is the plugin kind; `cause` is the thrown value (`unknown`). |

## Bus API

```ts
interface EventBus {
  emit<K>(event: K, payload: EventPayload<K>): void
  on<K>(event: K, handler: (payload: EventPayload<K>) => void): Unsubscribe
  once<K>(event: K, handler: (payload: EventPayload<K>) => void): Unsubscribe
}
```

`on` and `once` return an `Unsubscribe` function (`() => void`).
