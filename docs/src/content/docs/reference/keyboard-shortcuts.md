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

| Action | Shortcut |
|--------|----------|
| Save + assemble + snapshot | `Ctrl+S` |
| Assemble (no save) | `Ctrl+B` |
| Assemble (no save) | `Ctrl+Shift+B` |
| Run | `Ctrl+Enter` |
| Restart (reset, then run if it was running) | `Ctrl+Shift+Enter` |
| Pause | `Ctrl+.` |
| Stop | `Ctrl+Shift+.` |
| Toggle breakpoint at cursor | `F9` |
| Step instruction | `F10` |
| Step frame | `F11` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` |

`F10` (step) and `F11` (frame) only act when the emulator is loaded and not
running. `Run` only fires when the project can run and is not already running.

## Menu shortcuts

Editor menu actions display these shortcuts. Cut/Copy/Paste/Find/Replace are
listed in the Edit menu but are currently disabled placeholders.

| Menu item | Shortcut |
|-----------|----------|
| File → Save | `Ctrl+S` |
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
