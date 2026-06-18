---
title: Workspace tour
description: What each part of the madside window does.
---

The window has five regions.

## Menu bar & toolbar

Across the top: **File / Edit / Run / Help** menus and a toolbar with the run controls — Run, Pause, Stop, Step (one instruction), Frame (one display frame), and Reset.

## Files (left)

The project file tree. Add files (`+f`) and folders (`+/`), rename, delete, and set the **main** file (the assembler's entry point — marked `MAIN`). `project.json` holds the project manifest.

When you're in a course, a **Lesson** panel sits below the file tree.

## Editor (centre)

A CodeMirror editor. For **assembly**: highlighting, autocomplete (opcodes, directives, your labels), hover docs (hover an opcode for what it does, a label for its definition), and go-to-definition (Ctrl-click a label). For **C** (cc65 projects): highlighting, autocomplete of the cc65 standard library and your own functions across files (auto-`#include`d when accepted), and [clang-format](/docs/using/editor/) on save (Ctrl+S) or with Shift+Alt+F. Brackets auto-close as you type. The gutter on the left shows line numbers + the emit address of each line; click it to toggle a breakpoint.

## Emulator & debug (right)

The **Emulator** canvas shows the machine's screen. Below it:

- **Memory** — a hex view; type an address to jump, and it follows the cursor's source line.
- **Registers / Flags** — the CPU state, updated when you pause or step.
- Machine-specific panels — the NES build adds a **PPU** viewer (pattern tables + palette).

## Output (bottom)

The assembler's output — `ok` or the error list. The status bar at the very bottom shows the active project, file, and run state.
