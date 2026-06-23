---
title: Plugin system overview
description: How madside discovers, registers, and loads plugins.
sidebar:
  order: 1
---

The workbench core knows nothing about Atari, NES, MADS, or jsnes. Those are **plugins**, registered with a single **PluginRegistry** and resolved by id.

## Plugin kinds

| Kind | What it provides |
|------|------------------|
| `machine` | A target machine — display, memory map + extra spaces, input, media formats, boot equates. |
| `toolchain` | An assembler/compiler — the build, plus the editor language (directives, snippets). |
| `emulator` | A run backend — framebuffer, audio, single-instruction step, breakpoints, save state. |
| `debug-adapter` | The debugger surface — register/flag descriptors, step, memory reads. |
| `panel` | A UI panel — registers, memory, variables, machine-specific viewers. |
| `converter` | An asset transform — image/CSV/binary → assembler data. |
| `editor` | A visual editor for a file type — a graphical UI (bitmap, hex, …) replacing the text editor. |
| `theme` | A colour palette — design tokens applied as CSS custom properties. |

A project's `project.json` selects which `machine` and `toolchain` it uses; the machine declares which emulators and debug adapters are compatible. See the [Reference](/docs/reference/) for the full manifest schema.

## The registry

Every plugin shares a minimal base — an `id`, its `kind`, and an optional `name`/`version`:

```ts
interface PluginBase {
  readonly id: string       // kebab-case ascii slug — stable; manifest dispatch keys off it
  readonly kind: PluginKind // 'machine' | 'toolchain' | 'emulator' | 'debug-adapter' | 'panel' | 'converter' | 'editor' | 'theme'
  readonly name?: string
  readonly version?: string
}
```

The registry is small — register, look up by `(kind, id)`, list a kind:

```ts
interface PluginRegistry {
  register<T extends PluginBase>(entry: PluginEntry<T>): () => void  // returns an unregister disposer
  unregister(kind: PluginKind, id: string): void
  get<T extends PluginBase>(kind: PluginKind, id: string): T | undefined
  list<T extends PluginBase>(kind: PluginKind): T[]
}
```

Services resolve plugins through `get`/`list` — `BuildService` looks up `get('toolchain', manifest.toolchain)`, the debugger lists panels with `list('panel')`, and so on. The core never imports a plugin module directly.

## Registering a plugin

Built-ins are registered in [`apps/ide/src/app/createWorkbench.ts`](https://github.com/) at workbench construction. You pass a `PluginEntry` — the plugin tagged with its `kind` plus a `source` descriptor:

```ts
plugins.register({
  plugin: { ...myToolchain, kind: 'toolchain' },
  source: { origin: 'builtin' },
})
```

`source.origin` is `'builtin'` or `'project'`. For project-local plugins, `source.path` points at the module inside the project tree (e.g. `converters/png-to-charset.js`). **Resolution rule:** a project-local plugin *shadows* a built-in with the same id, so a project can override behaviour without forking madside.

## Built-in vs project-local

- **Built-in** plugins ship with madside and register at startup.
- **Project-local** plugins live in the project itself, as plain ES modules loaded at runtime via a Blob URL + dynamic `import()` (`@adapters/plugin-loader` — sha256-cached). No build step: drop a file in the project and it loads.

Project-local loading is currently limited to **two kinds**:

| Kind | Project-local? | Where |
|------|----------------|-------|
| `converter` | ✅ yes | `converters/*.js` |
| `editor` | ✅ yes | `editors/*.js` |
| `machine`, `toolchain`, `emulator`, `debug-adapter`, `panel` | ❌ built-in only | — |

Machines, toolchains, emulators, debug adapters, and panels are **built-in only** today — registered at startup, not yet supplied per-project. Opening those up to project-local (and third-party) loading is planned but not available; for now, adding one means contributing a built-in plugin to madside itself. (The plugin contracts are deliberately distribution-agnostic, so a Blob-URL or published-types path can light up later without a contract change.)

## What's shared vs plugin-specific

Some vocabulary is **CPU-level** and shared across plugins — the 6502 register/flag descriptors and opcode set, for example, come from the machine's CPU and serve every 6502 assembler or debugger. The **toolchain** contributes only what's assembler-specific (its directives, comment style, snippets); a **debug adapter** for a new 6502 machine reuses the shared descriptor tables. Keeping that split is why a second assembler gets correct highlighting and autocomplete — and a second 6502 machine gets a working debugger — for free.

The per-kind authoring guides follow in this section. If your plugin executes heavy compute (an assembler, an emulator step loop), note that the workbench assigns a **host** per kind (main thread vs worker) — see [Architecture in brief](/docs/extending/architecture/).
