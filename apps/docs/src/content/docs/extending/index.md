---
title: Extending madside
description: Add machines, toolchains, emulators, panels, converters, and editors.
sidebar:
  order: 0
---

Almost everything in madside is a **plugin**. The workbench core knows nothing about Atari, NES, MADS, or jsnes — those are plugins, registered with a single registry and resolved by id. This section is for authors adding new capabilities: a new retro machine, a new assembler, a custom panel, an asset converter, or a file editor.

The plugin model has two halves. The **contracts** are TypeScript interfaces in [`src/ports/plugin-*.ts`](https://github.com/) — small, declarative, and the single source of truth for what each plugin must provide. The **registry** (`PluginRegistry`) discovers plugins by *kind* (`machine`, `toolchain`, `emulator`, `debug-adapter`, `panel`, `converter`, `editor`) and resolves them by *id*. A project's `project.json` picks which machine and toolchain it uses; the machine declares which emulators and debug adapters are compatible. Get the contracts right and a second machine is a packaging exercise, not a fork.

Today most kinds ship **built-in** (registered at workbench startup), and only **converters** and **editors** can be **project-local** — plain ES modules dropped into a project and loaded at runtime. The pages below curate each contract into a practical, copy-pasteable how-to.

## Pages

- [Plugin system overview](/docs/extending/plugin-system/) — the registry, the seven kinds, built-in vs project-local.
- [Architecture in brief](/docs/extending/architecture/) — layers, the event bus, the services, the sync rule panels follow.
- [Converters](/docs/extending/converter/) — turn assets into assembler data.
- [Editors](/docs/extending/editor/) — custom editors for project file types.
- [Panels](/docs/extending/panel/) — register/memory/PPU-style viewers, and how they read live service state.
- [Machine plugins](/docs/extending/machine/) — display, memory map, memory spaces, input, media, boot equates.
- [Toolchain plugins](/docs/extending/toolchain/) — the assemble contract and the editor language.
- [Emulator plugins](/docs/extending/emulator/) — the run backend (framebuffer, audio, step, breakpoints, save state).
- [Debug adapters](/docs/extending/debug-adapter/) — register/flag descriptors and the debug surface.
- [Adding a template](/docs/extending/templates/) — bundle a starter project.
- [Authoring a course](/docs/extending/courses/) — interactive lessons with declarative checks.
- [Validating your plugin](/docs/extending/validating/) — the contract test harnesses.

For the full `project.json` schema, the memory-space table, and the supported machine/toolchain/emulator matrix, see the [Reference](/docs/reference/) section.

Start with the [Plugin system overview](/docs/extending/plugin-system/).
