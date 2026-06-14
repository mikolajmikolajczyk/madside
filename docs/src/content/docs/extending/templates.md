---
title: Adding a template
description: Bundle a starter project that appears in the File → Templates menu.
sidebar:
  order: 10
---

A **template** is a starter project — a `project.json`, some source files, and a one-line descriptor. Templates appear in the File → Templates menu and the first-run welcome picker; choosing one instantiates a fresh project into storage.

Templates are bundled at build time from the repo-root `templates/` directory (via Vite's glob import) — no separate repo, no hosting, always available offline. See `src/app/templates.ts`.

## Layout

Each template is a directory `templates/<id>/`. The directory name is the template **id**. It contains:

```
templates/<id>/
  template.json     # picker descriptor (required)
  project.json      # the project manifest (required)
  src/…             # source files — anything else
```

A template missing `template.json` or `project.json` is treated as a packaging error and silently skipped (it won't crash the menu).

## `template.json`

The picker-facing descriptor:

```jsonc
{
  "name": "Atari — Hello World",
  "description": "Writes HELLO ATARI to the screen via SAVMSC. Minimal MADS source running on the Altirra core.",
  "machine": "atari-xl",
  "order": 1
}
```

| Field | Meaning |
|-------|---------|
| `name` | Display name in the menu and welcome cards. |
| `description` | One-line summary of what the template demonstrates. |
| `machine` | Machine id this template targets — shown as a badge in the picker. |
| `order` | Optional sort hint (ascending; missing sorts last). |

## `project.json`

A normal v2 project manifest — the same schema described in the [Reference](/docs/reference/):

```jsonc
{
  "version": 2,
  "name": "atari-hello",
  "main": "src/hello.a65",
  "machine": "atari-xl",
  "toolchain": "mads",
  "run": { "default": { "audio": true } }
}
```

On instantiation the manifest's `name` is overridden by the name the user gives the new project; everything else is copied verbatim.

## Source files

Everything in the template directory other than `template.json` and `project.json` is copied into the new project at the same relative path. For the Atari hello-world that's `src/atari.a65` (machine equates) and `src/hello.a65` (the entry point named by `main`). Source files are text — they're loaded with Vite's `?raw` glob.

## How it's wired

`templates.ts` eager-globs `/templates/**/*` at build time, groups files by their top-level directory (the id), and parses `template.json` / `project.json` out of each group. `listTemplates()` returns the picker entries (sorted by `order` then name); `instantiateTemplate(id, name?)` writes the files + manifest into storage as a new project. Adding a template is purely a matter of dropping a new `templates/<id>/` directory — no code change.

## Bundled examples

The repo ships `atari-hello` (Atari-XL + MADS + Altirra), `nes-hello` (NES + MADS → iNES, running on jsnes), and `empty` (a blank project for the Form view). Use them as references for the directory shape.
