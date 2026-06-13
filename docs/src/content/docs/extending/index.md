---
title: Extending madside
description: Add machines, toolchains, emulators, panels, converters, and editors.
sidebar:
  order: 0
---

Almost everything in madside is a **plugin**. This section is for authors adding new capabilities — a new retro machine, a new assembler, a custom panel, an asset converter, or a file editor.

Pages (filling in incrementally):

- **Plugin system overview** — the registry, the plugin kinds, how plugins load.
- **Architecture in brief** — layers, the event bus, services.
- **The project manifest** — the full `project.json` schema.
- **Converters** — turn assets into assembler data.
- **Editors** — custom editors for project file types.
- **Panels** — register/memory/PPU-style viewers (with memory spaces).
- **Machine plugins** — display, memory map, input, media, boot equates.
- **Toolchain plugins** — the assemble contract + editor language.
- **Emulator plugins** — the run backend (framebuffer, audio, step, breakpoints).
- **Debug adapters** — register/flag descriptors and the debug surface.
- **Adding a template** and **authoring a course**.
- **Validating your plugin** — the contract test harnesses.

Start with the [Plugin system overview](/docs/extending/plugin-system/).
