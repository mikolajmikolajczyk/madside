---
title: Plugin system overview
description: How madside discovers and loads plugins.
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
| `panel` | A UI panel — registers, memory, machine-specific viewers. |
| `converter` | An asset transform — image/CSV/binary → assembler data. |
| `editor` | A custom editor for a file type. |

A project's `project.json` selects which `machine` and `toolchain` it uses; the machine declares which emulators and debug adapters are compatible.

## Built-in vs project-local

- **Built-in** plugins ship with madside and register at startup.
- **Project-local** plugins live in the project itself, as plain ES modules loaded at runtime via a Blob URL + dynamic `import()`. A project-local plugin **shadows** a built-in with the same id, so a project can override behaviour without forking madside — no build step, just drop a file in.

Project-local loading is currently limited to **two kinds**:

| Kind | Project-local? | Where |
|------|----------------|-------|
| `converter` | ✅ yes | `converters/*.js` |
| `editor` | ✅ yes | `editors/*.js` |
| `machine`, `toolchain`, `emulator`, `debug-adapter`, `panel` | ❌ built-in only | — |

Machines, toolchains, emulators, debug adapters, and panels are **built-in only** today — they're registered at startup and can't yet be supplied per-project. Opening those up to project-local (and third-party) loading is planned but not available; for now, adding one of those means contributing a built-in plugin to madside itself.

## What's shared vs plugin-specific

Some vocabulary is **CPU-level** and shared across plugins — the 6502 opcode set + their docs, for example, come from the machine's CPU and serve every 6502 assembler. The **toolchain** contributes only what's assembler-specific (its directives, comment style, snippets). Keeping that split is why a second assembler gets correct highlighting and autocomplete for free.

The per-kind authoring guides (machine, toolchain, panel, …) follow in this section.
