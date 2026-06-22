---
title: Using the IDE
description: Machine-agnostic guide to working in madside.
sidebar:
  order: 0
---

This section covers working inside madside itself — independent of which retro machine you target. Everything runs in your browser: projects live in IndexedDB, the assembler is a WebAssembly build, and the emulator is a WebAssembly core. There is no server and no account.

Start with [Projects](/docs/using/projects/) for the file tree, manifest, and storage model. From there the workflow is the same on every machine: edit a source file and [build it](/docs/using/building/) (Ctrl+S or Run); the binary boots in the [emulator](/docs/using/running/); set [breakpoints](/docs/using/debugging/) and step through code while watching the registers, memory, and [variables panels](/docs/using/panels/). The whole layout is **dockable** — drag, float, or hide any panel and save the arrangement. The remaining pages cover the [asset pipeline](/docs/using/assets/), [snapshots](/docs/using/history/), [templates](/docs/using/templates/), and the guided [courses](/docs/using/courses/).

## Pages

- **[Projects](/docs/using/projects/)** — the manifest, file tree, main file, ZIP import/export, storage.
- **[Editor](/docs/using/editor/)** — autocomplete, go-to-definition, breakpoints, the address gutter.
- **[Building](/docs/using/building/)** — the build trigger (manual / auto), the Output panel, the source map.
- **[Running](/docs/using/running/)** — the run controls, keyboard shortcuts, audio.
- **[Debugging](/docs/using/debugging/)** — breakpoints, step vs frame, registers, the memory viewer, the variables panel.
- **[Panels](/docs/using/panels/)** — registers, memory, variables, output, the dockable layout, and machine-specific viewers.
- **[Asset pipeline](/docs/using/assets/)** — converters and recipes.
- **[History](/docs/using/history/)** — automatic and manual snapshots.
- **[Templates](/docs/using/templates/)** — starting from a bundled template.
- **[Courses](/docs/using/courses/)** — taking an interactive course.
