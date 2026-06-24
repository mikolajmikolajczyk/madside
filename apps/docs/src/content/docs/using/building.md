---
title: Building
description: Toolchains, build triggers, the Output panel, inline errors, and the source map.
sidebar:
  order: 3
---

madside builds your project with a toolchain selected by the project's `toolchain` id in `project.json`. By default the build runs when you save or press Run — there's no separate "compile" step to remember, and large projects don't recompile on every keystroke.

## Toolchains

Four toolchains ship today; the active one is set by `toolchain` in `project.json`:

- **MADS** — the Mad Assembler, for 6502 assembly (`.asm` / `.a65` / `.inc`). One pass produces the binary, a source map, and a label table.
- **cc65** — the cc65 C compiler plus the ca65 assembler and ld65 linker, for C and ca65 assembly (`.c` / `.s` / `.asm` / `.h` / `.inc`) on the 6502 machines. Each `.c` is compiled to assembly with cc65, every assembly file is assembled to an object with ca65, and ld65 links the objects against the target's bundled runtime library and config into the final binary (`.nes` for NES, `.xex` for Atari, `.prg` for C64). The bundled C runtime and headers are mounted read-only for the active machine — they show up in the Files panel's system view.
- **z88dk** — the sccz80 C compiler plus the z80asm assembler, for C and z80 assembly (`.c` / `.asm` / `.s` / `.h` / `.inc`) targeting the ZX Spectrum (→ `.sna`).
- **clownassembler** — the Motorola 68000 assembler (asm68k / SN-68k syntax) for the Sega Genesis. One pass produces the flat `.bin` ROM, a label table, and a source map.

## Build trigger

The build trigger is set by `build.trigger` in `project.json` (see [Manifest reference](/docs/reference/manifest/#fields)):

- **`manual`** (the default) — the build runs only when you **save** (Ctrl+S) or press **Run**. Editing doesn't trigger a build, which keeps large projects snappy.
- **`auto`** — every edit triggers a rebuild, debounced for 400 ms. Late builds are dropped so a slow assemble can't clobber a newer result.

Either way you can force a build immediately:

- **Ctrl+S** / **File → Save** — save, build, and take a snapshot.
- **Ctrl+B** / **Run → Build** — build without taking a snapshot.

Pressing **Run** also builds first if there's no current result. See the [keyboard shortcuts reference](/docs/reference/keyboard-shortcuts/) for the full key list.

:::note
Building and running are separate. A successful build does **not** load anything into the emulator — the binary is committed to the emulator only when you press **Run**. See [Running](/docs/using/running/).
:::

## cc65 build options

cc65 is configurable through `build.options` in `project.json` (see the [manifest reference](/docs/reference/manifest/#buildoptions--per-toolchain)):

- **Custom linker config** — set `options.config` to a project-relative path to your own ld65 `*.cfg` (custom memory layout, mappers, segments); it's used instead of the bundled `<target>.cfg`.
- **Per-tool flags** — `options.cc65Args` / `ca65Args` / `ld65Args` forward extra flags to each tool (e.g. `"cc65Args": ["-Osir"]`, `"ld65Args": ["-D", "__FOO__=1"]`).
- **Mixed C + assembly** — a project can contain both `.c` and hand-written `.s` files; cc65 compiles the C, ca65 assembles every `.s` (yours and the cc65-generated ones), and ld65 links them all into one binary. Reference an asm function from C by `extern`-declaring it and exporting it from the `.s` (cc65 prefixes C symbols with `_`, so a C `asmval()` is `.export _asmval`).

## The Output panel

The **Output** panel sits below the editor. It shows the toolchain's stdout and stderr — for cc65, each line is prefixed with the tool (`[cc65]`, `[ca65]`, `[ld65]`) that produced it — plus a status tag:

- **OK** — the build succeeded.
- **ERR** — the build failed; the error text is shown in the panel body.
- **—** — no build has run yet.

The status bar at the bottom of the window also reflects the latest build result.

## Inline error markers

Compile errors and warnings are parsed into structured diagnostics and marked directly in the editor — a red squiggle under the offending span, a gutter marker on the line, and the message on hover. This works for both MADS assembly errors and cc65 C / ca65 / ld65 errors, so you can jump straight to the failing line instead of reading the Output panel line by line.

## Persisted build

The last build is saved per project, so it survives a page reload: reopening a project restores its Output panel text, the inline error markers, and the built binary. You can press Run after a reload without rebuilding first, and a previously-failed build comes back with its errors still marked.

## The source map and labels

A successful build produces two things the rest of the IDE consumes:

- a **source map** linking machine addresses to source file + line — this drives the [address gutter](/docs/using/editor/#the-address-gutter), the [active-PC highlight](/docs/using/editor/#active-pc-highlight), and breakpoint-to-address resolution; and
- a **label table** of names to addresses, merged into the editor's [autocomplete and go-to-definition](/docs/using/editor/#autocomplete).

The source map is path-aware: two files with the same basename (for example `src/main.a65` and `lib/main.a65`) resolve independently.

Includes are resolved by the assembler relative to the project root; add source and `.inc` files from the **Files** panel as needed.

## Exporting the binary

**File → Export binary** downloads the assembled binary to your machine, named after the project with the machine's default media extension — `.xex` for Atari, `.nes` (iNES) for NES, `.prg` for C64, `.tap` for the ZX Spectrum, `.bin` for the Sega Genesis. It's enabled once a build has succeeded; run the result on a hardware emulator, flash it to a cart, or share it. (To export the whole *project* — sources + manifest — use **File → Export ZIP** instead.)
