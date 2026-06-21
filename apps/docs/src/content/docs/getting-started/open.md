---
title: Open the app
description: How to open madside and what your browser needs.
---

madside runs entirely in your browser — there is nothing to install. Open the hosted app and you're ready to write code.

## Browser requirements

The emulators run as WebAssembly and audio plays through an AudioWorklet. madside does **not** use `SharedArrayBuffer`, so it needs no special cross-origin-isolation headers (`COOP` / `COEP`) and runs on any static host — any current Chromium-based browser or Firefox works. (See the [FAQ](/docs/meta/faq/) for why.) A few things to know:

- **First load** compiles the emulator core lazily — the very first Run for a machine takes a moment while its core loads. Subsequent runs are instant.
- **Audio** only starts after a user gesture (clicking Run counts) — browsers block autoplay.
- **Your projects live in the browser** (IndexedDB). Clearing site data deletes them — use **Export ZIP** to keep a copy.

## First run

On an empty install madside opens a **template picker**. Pick a template (or a course) and a project is created and opened for you. From there, head to [Your first build & run](/docs/getting-started/first-run/).
