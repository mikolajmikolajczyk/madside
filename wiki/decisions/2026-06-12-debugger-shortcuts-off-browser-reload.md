# Debugger keyboard shortcuts moved off browser-reload bindings

**Date:** 2026-06-12
**Decider:** Mikołaj
**Tags:** ux | keybindings | tooling

## Context

`useDebuggerShortcuts` bound the Run family to F-keys + Ctrl-letter set borrowed from VSCode (F5 / Shift+F5 / Ctrl+Shift+F5 / Ctrl+R / Ctrl+Shift+R / Ctrl+P). Every one of those collides with browser reload / hard reload / print. The handler called `e.preventDefault()` to stop the browser, then fired the workbench callback — every "refresh" silently triggered Run. User-visible: emulator started running by itself, audio played, debugger flipped state. Issue `d64d0a4`; root cause diagnosed via `console.trace` on `setRunning`.

## Decision

Adopt the web-IDE convention shared by replit / stackblitz / codepen — Run family on Ctrl+Enter. Drop every binding that collides with browser reload or print:

| Key | Action |
|-----|--------|
| Ctrl+Enter | Run |
| Ctrl+Shift+Enter | Restart |
| Ctrl+. | Pause |
| Ctrl+Shift+. | Stop |
| Ctrl+S | Save + assemble + snapshot |
| Ctrl+B / Ctrl+Shift+B | Build |
| F9 | Toggle breakpoint |
| F10 | Step instruction |
| F11 | Step frame |

Dropped: F5, Shift+F5, Ctrl+Shift+F5, Ctrl+R, Ctrl+Shift+R, Ctrl+P.

## Alternatives considered

- **Keep VSCode bindings, document the conflict.** Rejected — every future contributor / user hits the same footgun. preventDefault is not a defence when the user expects browser-default behaviour.
- **Keep F-keys, drop only Ctrl+R variants.** Rejected — F5 alone is enough to repro the bug.
- **Drop all keyboard shortcuts, buttons only.** Considered. Rejected — keyboard control is core to debugger UX.

## Trigger to revisit

If the workbench ships as a desktop wrapper (Tauri / Electron / native) the browser collisions go away and VSCode-style F-keys become viable again. Re-bind then.

## Links

- Issue `d64d0a4`
- Implementation: commit `701373a`
- Touched files: `src/ui/hooks/useDebuggerShortcuts.ts`, `src/ui/components/layout/{DebugBar,MenuBar}.tsx`, `src/ui/App.tsx` (CommandRegistry shortcut strings)
