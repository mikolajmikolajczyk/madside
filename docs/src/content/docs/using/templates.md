---
title: Templates
description: Starting a project from a bundled template.
sidebar:
  order: 9
---

A **template** is a ready-made starting project — a manifest plus source files — bundled into madside. Templates are always available offline; there's nothing to download.

## Bundled templates

madside ships with:

- **atari-hello** — a minimal Atari (atari-xl) program assembled with MADS.
- **nes-hello** — a minimal NES program, also assembled with MADS.
- **empty** — a blank project you fill in yourself.

## Starting from a template

Two ways to instantiate one:

- **File → Templates → …** — pick a template from the menu; it's created as a new project and opened. (The `empty` template is offered as **File → New project…** instead.)
- **The welcome picker** — when you have no project open (first run, or after deleting your last project), madside shows a picker. The **Empty project** section at the top lets you edit the `project.json` before creating; below it are cards for each template showing its target machine and the files it ships.

Picking a template copies its files into a fresh project in your browser storage. From there it's an ordinary project — edit it, [build](/docs/using/building/), and [run](/docs/using/running/) it like any other. See [Projects](/docs/using/projects/) for the manifest and file model.
