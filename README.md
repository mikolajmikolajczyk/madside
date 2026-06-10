# madside

> Browser-native IDE for retro hardware. Started as an Atari 8-bit workbench (MADS + Altirra wasm), heading toward a plugin-based workbench that any retro platform can target.

[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)
[![License: TBD](https://img.shields.io/badge/license-TBD-lightgrey)](#license)
[![Canonical: Radicle](https://img.shields.io/badge/canonical-radicle-blueviolet)](#contributing)

<!-- TODO: screenshot or animated demo here -->
<!-- ![madside running an Atari project](assets/screenshot.png) -->

## What it does

- Edit Atari 6502 assembly in the browser (CodeMirror 6, MADS syntax, autocomplete from project labels).
- Auto-assemble on file change via `mads.wasm`. Source map highlights the current PC.
- Run + debug in an embedded Altirra core (wasm). Breakpoints, single-instruction step, frame step, register + flag view, live memory inspector.
- Per-project asset pipeline: PNG → charset, BIN → `.incbin`, write your own converter as a single JS file.
- Plugin file editors (Phase 11): drop a JS module into `editors/` to render a custom view for a file extension.
- All project data in IndexedDB. Content-addressable snapshots every 30s. ZIP export/import.

What it is **not** (yet): a multi-machine workbench. NES, C64, fantasy consoles — coming. See [ADR-0001](wiki/adr/0001-plugin-based-workbench.md).

## Status

Pre-v1. Solo development. Active milestones tracked in [Radicle](#contributing). Functional for Atari development today; APIs change without notice until the M3-services refactor stabilizes the plugin contracts.

## Quick start

### With Nix (recommended, lands in Foundation)

```sh
nix develop          # provisions Node, pnpm, just, static analysis stack
pnpm install
pnpm dev             # vite dev server
```

`direnv` auto-activates the shell on `cd` if you have it.

### Without Nix (fallback)

You need Node ≥ 22 and `pnpm` ≥ 10 on your PATH.

```sh
pnpm install
pnpm dev
```

`npm` also works (`npm install && npm run dev`).

Open the dev server URL, hit **New Project** → start typing assembly.

## Building from source

```sh
pnpm build           # tsc -b && vite build → dist/
pnpm preview         # serve dist/
```

Rebuilding the bundled wasm artifacts (`mads.wasm`, `altirra-core.wasm`) is rare. See [`wiki/agents/mads-wasm-build.md`](wiki/agents/mads-wasm-build.md) and [`wiki/agents/altirra-wasm-build.md`](wiki/agents/altirra-wasm-build.md).

## Architecture

Madside is moving from an Atari-specific IDE to a plugin-based workbench. The pivot, layering rules, and per-milestone scope are documented in:

- **[ADR-0001 — Plugin-based retro-development workbench](wiki/adr/0001-plugin-based-workbench.md)** — vision, plugin taxonomy, migration phases
- **[AGENTS.md](AGENTS.md)** — repo-specific notes for human and AI contributors
- **[wiki/agents/architecture.md](wiki/agents/architecture.md)** — current as-built layout
- **[wiki/](wiki/)** — full documentation tree

## Roadmap

Tracked exclusively in Radicle issues — there is no markdown roadmap.

```sh
rad issue list --all
```

Milestones: `m2` (Atari finish) → `m2-5-foundation` (architectural cleanup) → `m3-services` → `m4-machine-plugin` → … → `m9-nes` (second machine validation).

## Contributing

Canonical home is **Radicle**, not GitHub.

- Read [`wiki/skills/radicle.md`](wiki/skills/radicle.md) before driving `rad`.
- Issue conventions (labels, epics, milestones) follow [`wiki/skills/radboard.md`](wiki/skills/radboard.md).
- Patches: `git push rad HEAD:refs/patches`.
- GitHub mirror is **CI-only**. Issues and pull requests on GitHub are not accepted.

For coding conventions see [`wiki/agents/conventions.md`](wiki/agents/conventions.md). For the ADR bar see [`wiki/adr/README.md`](wiki/adr/README.md).

## License

TBD. License decision tracked as a Foundation issue. Until then, treat the code as "all rights reserved, fork at your own risk". Plugin and contributor licensing finalises with the decision.

## Acknowledgements

- **Altirra** by Avery Lee — the cycle-exact Atari emulator that powers the run + debug path. The wasm core is built from a [fork](https://github.com/mikolajmikolajczyk/AltirraSDL) with a small embedding shim.
- **MADS** by Tomasz Biela — the fast, modern 6502 cross-assembler bundled as `mads.wasm`.
- **8bitworkshop** — earlier reference for the in-browser IDE approach, since replaced by the Altirra wasm path.
