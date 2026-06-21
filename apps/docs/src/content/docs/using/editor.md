---
title: Editor
description: Autocomplete, C/C++ formatting, go-to-definition, breakpoints, and the editor gutters.
sidebar:
  order: 2
---

madside edits source in a [CodeMirror](https://codemirror.net/)-based editor. Assembly files (`.a65` / `.asm` / `.inc` / `.s` / `.mac`) get syntax highlighting, completion, and the debug gutters; C/C++ sources (`.c` / `.h` / `.cc` / `.cpp` / `.hpp`) in cc65 projects get their own highlighting, completion, hover, and formatting (see [C/C++ editing](#cc-editing)); JavaScript converter files (`.js` / `.ts`) and `.json` get their own language support.

## Indentation

**Tab** inserts one indent level — `editor.tabWidth` spaces, **4 by default**. The same width controls how literal tab characters render. Change it per project with `editor.tabWidth` in `project.json` (see the [manifest reference](/docs/reference/manifest/)). **Ctrl+S** saves and assembles (see [Building](/docs/using/building/)).

## Auto-close brackets

Typing an opening `{`, `(`, `[`, or `"` inserts the matching close and leaves the cursor between them. It's bracket- and string-aware — typing the close over an auto-inserted one steps past it instead of doubling it, and backspacing over the pair removes both.

## Autocomplete

Completion fires as you type and is built from:

- the active machine's CPU opcodes and the toolchain's directives, and
- labels — both the ones scanned out of every assembly file in the project and the labels the assembler emits after a build.

The completion vocabulary follows the project's machine and toolchain, so it changes when you switch a project from one machine to another.

## C/C++ editing

cc65 projects can mix assembly with C. Open a `.c` / `.h` / `.cc` / `.cpp` / `.hpp` file and the editor switches to C syntax highlighting (powered by CodeMirror's `lang-cpp`) and turns on C-specific completion, hover, and formatting.

:::note
There's no clangd or language server behind this — completion and hover are built from a **curated** cc65 standard-library list plus a lightweight scan of your project's own files. They're a helpful shortcut, not a full semantic analysis, so they won't catch every symbol or type error.
:::

### Autocomplete and headers

C completion is drawn from three sources:

- **cc65 standard library** — a curated slice of the common surface: the `conio.h` text console (`clrscr`, `cputs`, `cputc`, `gotoxy`, `cgetc`, `textcolor`, …), plus pieces of `string.h` (`memcpy`, `strlen`, …), `stdlib.h` (`malloc`, `rand`, …), and the `stdint.h` fixed-width types (`uint8_t`, `int16_t`, …). Accepting one of these **auto-adds the right `#include`** if it's missing — pick `clrscr` and `#include <conio.h>` is inserted after your last existing include (or at the top of the file).
- **Your project's own symbols** — every `.c` / `.h` in the project is scanned for its top-level functions, `#define` macros, and `typedef`d types, so a function defined in `helper.c` completes while you're editing `main.c`.
- **The current file** — definitions in the buffer you're editing, even before you save.

### Hover

Hover a cc65 library symbol to see its signature, the header that declares it (`#include <conio.h>`), and a one-line description. Hover one of your project's own symbols and the tooltip shows its kind (function / macro / type) and the file it's defined in.

### Formatting

C/C++ sources are formatted with **clang-format** — the same LLVM formatter that VS Code's C/C++ extension uses, compiled to WebAssembly and run entirely in the browser. (The first format downloads a ~2.3 MB module; it's cached afterward, and madside prefetches it as soon as you open a C file so the first format is fast.)

Two ways to format:

- **Ctrl+S** — formats the active C/C++ file, then builds and snapshots, all in one step (see [Building](/docs/using/building/)).
- **Shift+Alt+F** — "Format Document" (VS Code parity): formats only, no build.

The style is resolved in this order:

1. A `.clang-format` file in the project (full clang-format control).
2. Otherwise the `editor.format` preset in `project.json` (e.g. `LLVM`, the default).
3. The indent width always follows `editor.tabWidth` (default 4 spaces, tabs never used), so formatting and the editor's own indentation agree.

Formatting also wraps single-statement control-flow bodies in braces — `if (x) y;` becomes `if (x) { y; }`. See the [manifest reference](/docs/reference/manifest/) for `editor.tabWidth` and `editor.format`, and the [keyboard shortcuts](/docs/reference/keyboard-shortcuts/) for the format keys.

:::note
There's no format-on-type — formatting only runs when you trigger it with Ctrl+S or Shift+Alt+F. If clang-format can't run (load failure or an invalid style), your source is left untouched and the build still proceeds.
:::

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
