---
title: Editor
description: Autocomplete, go-to-definition, breakpoints, and the editor gutters.
sidebar:
  order: 2
---

madside edits source in a [CodeMirror](https://codemirror.net/)-based editor. Assembly files (`.a65` / `.asm` / `.inc` / `.s` / `.mac`) get syntax highlighting, completion, and the debug gutters; JavaScript converter files (`.js` / `.ts`) and `.json` get their own language support.

## Indentation

**Tab** inserts 8 spaces, and the tab width is 8 columns. **Ctrl+S** saves and assembles (see [Building](/docs/using/building/)).

## Autocomplete

Completion fires as you type and is built from:

- the active machine's CPU opcodes and the toolchain's directives, and
- labels — both the ones scanned out of every assembly file in the project and the labels the assembler emits after a build.

The completion vocabulary follows the project's machine and toolchain, so it changes when you switch a project from one machine to another.

## Go-to-definition

**Ctrl-click** (Cmd-click on macOS) a label name to jump to its definition. If the label lives in a different file, madside switches the active tab and scrolls to it. Definitions are resolved from the project-wide label index, falling back to the source map's address mapping when a scanned location isn't available.

## Hover

Hovering a known label or opcode shows a tooltip with its documentation and, where available, a short preview.

## Breakpoints

Click the breakpoint gutter (just left of the line numbers) to toggle a breakpoint on that line; a dot marks the line. You can also toggle a breakpoint at the cursor with **F9**. Breakpoints are per-file and persist across re-assembles and reloads. See [Debugging](/docs/using/debugging/) for how they trap the emulator.

## The address gutter

After a successful build, a second gutter shows the 4-digit hex address each emitting source line assembled to. Lines that produce no bytes are blank.

## Active-PC highlight

While the emulator is paused, stepping, or stopped at a breakpoint, the line corresponding to the current program counter is highlighted. If the PC moves into an included file, madside switches the active tab to that file so the highlight stays visible.

:::note
The PC highlight is hidden while the emulator is running at full speed — the program counter moves too fast to track. It reappears the moment you pause, step, or hit a breakpoint.
:::
