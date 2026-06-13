---
title: Projects
description: How projects, the manifest, and storage work.
sidebar:
  order: 1
---

A **project** is a tree of files plus a manifest. madside keeps your projects in the browser (IndexedDB); there is no server.

## Creating projects

- **File → Templates → …** instantiates a bundled template (the quickest start).
- **File → New project…** creates an empty project.
- **File → Import ZIP…** loads a project you previously exported.

Switch between projects with **File → Switch project**. Deleting your last project returns you to the template picker.

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
- `toolchain` — which assembler builds it (`mads`).
- `main` — the file the assembler is pointed at; shown as `MAIN` in the file tree.

Changing `machine` switches the active emulator + debug view the next time the project loads. (Full manifest field reference lives in [Reference](/docs/reference/).)

## Files

Add files and folders from the **Files** panel. Source files use `.a65` / `.asm` / `.inc`; the assembler resolves includes (`icl`) relative to the project root. Binary assets (images, CSV) feed the [asset pipeline](/docs/using/).

## Storage, export, and snapshots

- Projects persist in IndexedDB and survive reloads.
- **File → Export ZIP** / **Import ZIP** move a project in and out of the browser.
- madside auto-snapshots your work; restore older states from **File → History**.

:::caution
Clearing the browser's site data deletes your projects. Export anything you want to keep.
:::
