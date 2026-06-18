---
title: Projects
description: How projects, the manifest, and storage work.
sidebar:
  order: 1
---

A **project** is a tree of files plus a manifest. madside keeps your projects in the browser (IndexedDB); there is no server.

## Creating projects

**File → New project** opens the **welcome screen** — the hub for starting work. From there you can:

- reopen one of **your existing projects**;
- create an **empty project** (edit its `project.json` before creating);
- start from a **template** (the quickest start); or
- **follow a course** (bundled, or added from a GitHub repo).

You can also **File → Import ZIP…** to load a project you previously exported.

Switch between open projects with **File → Switch project**. Deleting your last project returns you to the welcome screen.

## The manifest — `project.json`

Every project has a `project.json` at its root. It selects the machine, toolchain, and entry point:

```json
{
  "version": 2,
  "name": "atari-hello",
  "main": "src/hello.a65",
  "machine": "atari-xl",
  "toolchain": "mads",
  "run": { "default": { "audio": true } }
}
```

- `machine` — which machine plugin to run on (`atari-xl`, `nes`).
- `toolchain` — which toolchain builds it: `mads` (Atari assembly) or `cc65` (C + ca65 assembly, for NES and Atari).
- `main` — the entry-point file the toolchain is pointed at; shown as `MAIN` in the file tree.

Optional sections tune the build and editor — `build.trigger` (`manual` by default, or `auto` to rebuild on every edit), `build.args`, and `editor` (`tabWidth`, clang-format `format`). Changing `machine` switches the active emulator + debug view the next time the project loads. Full field reference: [`project.json`](/docs/reference/manifest/).

## Files

Add files and folders from the **Files** panel. Assembly sources use `.a65` / `.asm` / `.inc` (the assembler resolves `icl` includes relative to the project root); C sources for cc65 use `.c` / `.h`. Binary assets (images, CSV) feed the [asset pipeline](/docs/using/). When the toolchain ships a sysroot (cc65's headers + runtime), it appears as a read-only **system** tree.

## Storage, export, and snapshots

- Projects persist in IndexedDB and survive reloads.
- **File → Export ZIP** / **Import ZIP** move a project in and out of the browser.
- madside auto-snapshots your work; restore older states from **File → History**.

:::caution
Clearing the browser's site data deletes your projects. Export anything you want to keep.
:::
