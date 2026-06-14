---
title: Building
description: Auto-assemble, the Output panel, and the source map.
sidebar:
  order: 3
---

madside assembles your project automatically as you edit — there is no separate build step you have to remember.

## Auto-assemble

Every change to your files is debounced for 400 ms, then assembled. The assembler is chosen by the project's `toolchain` id in `project.json` (MADS today). Late builds are dropped so a slow assemble can't clobber a newer result.

You can force an assemble immediately, skipping the debounce:

- **Ctrl+S** / **File → Save** — save, assemble, and take a snapshot.
- **Ctrl+B** / **Run → Build** — assemble without taking a snapshot.

:::note
Assembling and running are separate. A successful build does **not** load anything into the emulator — the binary is committed to the emulator only when you press **Run**. See [Running](/docs/using/running/).
:::

## The Output panel

The **Output** panel sits below the editor. It shows the assembler's stdout and stderr and a status tag:

- **OK** — the build succeeded.
- **ERR** — the build failed; the error text is shown in the panel body.
- **—** — no build has run yet.

The status bar at the bottom of the window also reflects the latest build result.

## The source map and labels

A successful build produces two things the rest of the IDE consumes:

- a **source map** linking machine addresses to source file + line — this drives the [address gutter](/docs/using/editor/#the-address-gutter), the [active-PC highlight](/docs/using/editor/#active-pc-highlight), and breakpoint-to-address resolution; and
- a **label table** of names to addresses, merged into the editor's [autocomplete and go-to-definition](/docs/using/editor/#autocomplete).

The source map is path-aware: two files with the same basename (for example `src/main.a65` and `lib/main.a65`) resolve independently.

Includes are resolved by the assembler relative to the project root; add source and `.inc` files from the **Files** panel as needed.
