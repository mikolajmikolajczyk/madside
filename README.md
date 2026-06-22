# madside

[![CI](https://github.com/mikolajmikolajczyk/madside/actions/workflows/ci.yml/badge.svg)](https://github.com/mikolajmikolajczyk/madside/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)](#status)

**An in-browser IDE for retro hardware.** Write assembly or C, assemble/compile it, run it on a cycle-accurate emulator, and debug it with breakpoints, a register view, and a memory inspector — all in the browser, nothing to install.

### ▶︎ [Try it live → madside.mikolajczyk.org](https://madside.mikolajczyk.org) · 📖 [Docs](https://madside.mikolajczyk.org/docs/)

<!-- TODO: screenshot or animated demo here -->
<!-- ![madside running an Atari project](assets/screenshot.png) -->

It currently targets four machines, across two CPU families and three toolchains:

- **Atari 8-bit** (800XL / 130XE) — the [MADS](https://mads.atari8.info/) assembler or [cc65](https://cc65.github.io/) (C), on the Altirra core.
- **NES** — MADS (assembles NROM iNES directly) or cc65 (C), on the [jsnes](https://github.com/bfirsh/jsnes) core.
- **Commodore 64** — cc65 (C), on the [chips](https://github.com/floooh/chips) C64 core.
- **ZX Spectrum** — [z88dk](https://z88dk.org/) (C) or z80 assembly, on the chips ZX core.

Everything beyond the editor is a **plugin**: machines, toolchains, emulators, debug adapters, panels, file converters, and editors. Adding a new retro platform doesn't touch the workbench — it ships as a set of plugins. See [ADR-0001](wiki/adr/0001-plugin-based-workbench.md).

## What you can do

- Start from a **template** or a guided **course** (bundled, or loaded from any public GitHub repo), then edit, assemble, and run.
- Auto-assemble/compile on edit; a source map drives the address gutter and active-PC highlight.
- Write **C** (cc65 / z88dk) with full in-editor intelligence — completion, hover, go-to-definition, references, rename, and inline diagnostics — from an in-browser language server (no extension, no server). See [ADR-0009](wiki/adr/0009-in-repo-language-agnostic-lsp.md).
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
pnpm --filter @madside/docs dev   # the Astro docs site
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
- **cc65** by Ullrich von Bassewitz and contributors — the 6502 C compiler / assembler / linker (`cc65`/`ca65`/`ld65`), compiled to wasm.
- **z88dk** — the z80 C toolchain (`zcc`/`sccz80`/`z80asm`) behind ZX Spectrum C, compiled to wasm.
- **chips** by Andre Weissflog — the cycle-accurate C64 + ZX Spectrum emulator cores.
- **jsnes** by Ben Firshman — the NES emulator core.
