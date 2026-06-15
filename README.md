# madside

[![CI](https://github.com/mikolajmikolajczyk/madside/actions/workflows/ci.yml/badge.svg)](https://github.com/mikolajmikolajczyk/madside/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)

**An in-browser IDE for retro hardware.** Write 6502 assembly, assemble it, run it on a cycle-accurate emulator, and debug it with breakpoints, a register view, and a memory inspector — all in the browser, nothing to install.

### ▶︎ [Try it live → madside.mikolajczyk.org](https://madside.mikolajczyk.org) · 📖 [Docs](https://madside.mikolajczyk.org/docs/)

<!-- TODO: screenshot or animated demo here -->
<!-- ![madside running an Atari project](assets/screenshot.png) -->

It currently targets two machines:

- **Atari 8-bit** (800XL / 130XE) — the [MADS](https://mads.atari8.info/) assembler on the Altirra core.
- **NES** — MADS again (it assembles NROM iNES directly), on the [jsnes](https://github.com/bfirsh/jsnes) core.

Everything beyond the editor is a **plugin**: machines, toolchains, emulators, debug adapters, panels, file converters, and editors. Adding a new retro platform doesn't touch the workbench — it ships as a set of plugins. See [ADR-0001](wiki/adr/0001-plugin-based-workbench.md).

## What you can do

- Start from a **template** or a guided **course** (bundled, or loaded from any public GitHub repo), then edit, assemble, and run.
- Auto-assemble on edit via `mads.wasm`; a source map drives the address gutter and active-PC highlight.
- Set source-level **breakpoints**, step by instruction or by frame, and watch registers, flags, and memory update live.
- Inspect machine-specific state — the NES build ships a **PPU viewer** (pattern tables + palette).
- Convert assets (images, CSV, binaries) into assembler data with the **asset pipeline**, or write your own converter as a single JS file.
- Keep work in the browser (IndexedDB) with automatic snapshots, and **export** a project as ZIP or the built binary (`.xex` / `.nes`).

## Status

**Alpha**, under active and extensive testing. Functional for Atari + NES development today. Your projects live in your browser; export anything you want to keep. The roadmap lives in [GitHub issues](https://github.com/mikolajmikolajczyk/madside/issues).

## Quickstart

Requires Node 22 + [pnpm](https://pnpm.io). A [Nix](https://nixos.org) flake is provided (`nix develop`, or `direnv allow` if you use direnv — it provisions the toolchain + static-analysis stack).

```sh
pnpm install
pnpm dev          # vite dev server
```

Other commands:

```sh
pnpm build              # tsc -b && vite build → dist/
pnpm exec vitest run    # tests
pnpm run lint           # eslint
pnpm --dir docs dev     # the Astro docs site
```

Rebuilding the bundled wasm artifacts (`mads.wasm`, `altirra-core.wasm`) is rare — see [`wiki/agents/mads-wasm-build.md`](wiki/agents/mads-wasm-build.md) and [`wiki/agents/altirra-wasm-build.md`](wiki/agents/altirra-wasm-build.md).

## Contributing

Contributions are welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for the dev setup, the PR flow, and how to add a machine / toolchain / panel / converter / course. The deeper architecture, plugin contracts, and coding conventions live under [`wiki/`](wiki/) and on the [docs site](https://madside.mikolajczyk.org/docs/extending/).

## License

[**AGPL-3.0-or-later**](LICENSE). Rationale in [ADR-0006](wiki/adr/0006-license-agpl.md).

Short version: you may use, study, modify, and redistribute madside — including hosting it as a web service — provided any modified version you distribute or expose over a network is also released under AGPL-3.0-or-later. Plugins may be released under any AGPL-compatible licence (MIT, Apache-2.0, GPL family, LGPL).

## Acknowledgements

- **Altirra** by Avery Lee — the cycle-exact Atari emulator powering the run + debug path. The wasm core is built from a [fork](https://github.com/mikolajmikolajczyk/AltirraSDL) with a small embedding shim.
- **MADS** by Tomasz Biela — the fast, modern 6502 cross-assembler bundled as `mads.wasm`.
- **jsnes** by Ben Firshman — the NES emulator core.
