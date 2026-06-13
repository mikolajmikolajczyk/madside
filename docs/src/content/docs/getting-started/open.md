---
title: Open the app
description: How to open madside and what your browser needs.
---

madside runs entirely in your browser — there is nothing to install. Open the hosted app and you're ready to write code.

## Browser requirements

The emulators run as WebAssembly with a shared-memory audio worklet, so the page is served with cross-origin isolation headers (`COOP` / `COEP`). Any current Chromium-based browser or Firefox works. A few things to know:

- **First load** compiles the emulator core lazily — the very first Run for a machine takes a moment while its core loads. Subsequent runs are instant.
- **Audio** only starts after a user gesture (clicking Run counts) — browsers block autoplay.
- **Your projects live in the browser** (IndexedDB). Clearing site data deletes them — use **Export ZIP** to keep a copy.

## First run

On an empty install madside opens a **template picker**. Pick a template (or a course) and a project is created and opened for you. From there, head to [Your first build & run](/docs/getting-started/first-run/).
