---
title: Keyboard shortcuts
description: The full keyboard shortcut table.
sidebar:
  order: 2
---

This page is the canonical shortcut table. The Run-family lives on `Ctrl+Enter`
so it never hijacks browser reload (`F5` / `Ctrl+R`).

On macOS, `Cmd` works wherever `Ctrl` is shown — the handler treats
`ctrlKey || metaKey` identically.

Every action is a command — the **command palette** (`Ctrl+K`, or `Ctrl+Shift+P`)
fuzzy-searches them all and shows each accelerator, so this table and the palette
never disagree.

| Action | Shortcut |
|--------|----------|
| Command palette | `Ctrl+K` (or `Ctrl+Shift+P`) |
| Format + save + assemble + snapshot | `Ctrl+S` |
| Format Document (no build) | `Shift+Alt+F` |
| Assemble (no save) | `Ctrl+B` |
| Run | `Ctrl+Enter` |
| Restart (reset, then run if it was running) | `Ctrl+Shift+Enter` |
| Pause | `Ctrl+.` |
| Stop | `Ctrl+Shift+.` |
| Toggle breakpoint at cursor | `F9` |
| Step instruction | `F10` |
| Step frame | `F11` |

`F10` (step) and `F11` (frame) only act when the emulator is loaded and not
running. `Run` only fires when the project can run and is not already running.

`Ctrl+S` formats the active C/C++ source with clang-format **before** it
assembles and snapshots — so Save is format → build → snapshot in one step.
`Shift+Alt+F` ("Format Document", VS Code parity) formats the active C/C++
source with clang-format **without** building. For non-C files it re-indents
via the language indent service; for assembly it is a no-op.

Undo / redo (`Ctrl+Z`, `Ctrl+Shift+Z`) are handled by the code editor while it
has focus, not the global command dispatcher.

## Menu shortcuts

Editor menu actions display these shortcuts. Cut/Copy/Paste/Find/Replace are
listed in the Edit menu but are currently disabled placeholders.

| Menu item | Shortcut |
|-----------|----------|
| File → Save (format + build + snapshot) | `Ctrl+S` |
| Edit → Format Document | `Shift+Alt+F` |
| Edit → Undo | `Ctrl+Z` |
| Edit → Redo | `Ctrl+Shift+Z` |
| Run → Build | `Ctrl+B` |
| Run → Run | `Ctrl+Enter` |
| Run → Pause | `Ctrl+.` |
| Run → Stop | `Ctrl+Shift+.` |
| Run → Step | `F10` |
| Run → Frame | `F11` |
| Run → Toggle breakpoint | `F9` |
| Run → Restart | `Ctrl+Shift+Enter` |
| Help → Command Palette | `Ctrl+K` |
