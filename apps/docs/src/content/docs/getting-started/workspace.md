---
title: Workspace tour
description: What each part of the madside window does.
---

The window is a **dockable workspace**: a menu bar + toolbar across the top, and
below it a Dockview layout where every part — files, editor, emulator, and each
debug panel — is a draggable surface. Drag a tab to re-dock or split it, double-
click to float, or toggle any panel from the **View** menu. Save an arrangement
as a named preset; the layout is remembered across reloads. The defaults below are
just the starting arrangement.

## Menu bar & toolbar

Across the top: **File / Edit / View / Run / Help** menus and a toolbar with the run controls — Run, Pause, Stop, Step (one instruction), Frame (one display frame), and Reset. The **View** menu shows/hides any panel and switches between named layouts + your presets.

## Files

The project file tree. Add files (`+f`) and folders (`+/`), rename, delete, and set the **main** file (the toolchain's entry point — marked `MAIN`). `project.json` holds the project manifest. The **Outline** and **References** surfaces (from the language server) dock alongside it. When you're in a course, a **Lesson** panel appears.

## Editor

A CodeMirror editor. For **assembly**: highlighting, autocomplete (opcodes, directives, your labels), hover docs (hover an opcode for what it does, a label for its definition), and go-to-definition (Ctrl-click a label). For **C** (cc65 or z88dk projects): highlighting, autocomplete of the standard library and your own functions across files (auto-`#include`d when accepted), hover, go-to-def / references / rename, and [clang-format](/docs/using/editor/) on save (Ctrl+S) or with Shift+Alt+F. Brackets auto-close as you type. The gutter shows line numbers + the emit address of each line; click it to toggle a breakpoint.

## Emulator & debug panels

The **Emulator** canvas shows the machine's screen. The debug panels (dock anywhere):

- **Memory** — a hex view; type an address to jump, and it follows the cursor's source line.
- **Registers / Flags** — the CPU state, updated when you pause or step.
- **Variables** — typed globals + a struct/array/pointer tree + watch expressions on C builds (flat symbols otherwise).
- Machine-specific panels — the NES build adds a **PPU** viewer (pattern tables + palette).

## Output

The toolchain's output — `ok` or the error list. The status bar at the very bottom shows the active project, file, and run state.
