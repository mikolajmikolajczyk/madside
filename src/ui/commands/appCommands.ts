// The workbench command set. Every user action is one command — toolbar,
// keyboard shortcut, and the command palette all dispatch through these via
// `commands.run(id, ctx)`. Commands are registered once; their run/when read
// the latest app state through `get()` so they stay current without re-register
// churn (mirrors the fresh-callback pattern the old shortcut hook used).

import type { Command } from '@ports'
import { focusPaneInDirection } from './paneFocus'

export interface AppCommandOps {
  runAssemble: () => Promise<unknown> | void
  onRun: () => Promise<unknown> | void
  onPause: () => void
  onStop: () => void
  onStep: () => void
  onStepFrame: () => void
  onReset: () => Promise<unknown> | void
  toggleBpAtCursor: () => void
  /** Format the active C/C++ document in place (clang-format, #60). No-op for
   *  non-C files. Awaited before build/snapshot on Save. */
  formatActive: () => Promise<void> | void
  onSnapshot: () => void
  openPalette: () => void
}

export interface AppCommandState {
  canRun: boolean
  running: boolean
  hasEmu: boolean
}

export interface AppCommandEnv {
  ops: AppCommandOps
  state: AppCommandState
}

/** Palette-toggle command id — excluded from the palette's own listing. */
export const PALETTE_COMMAND_ID = 'view.commandPalette'

export function buildAppCommands(get: () => AppCommandEnv): Command[] {
  const ops = () => get().ops
  const st = () => get().state
  return [
    { id: PALETTE_COMMAND_ID, title: 'Command Palette', shortcut: 'Ctrl+K', run: () => ops().openPalette() },
    { id: 'build.assemble', title: 'Build', shortcut: 'Ctrl+B', run: () => { void ops().runAssemble() } },
    { id: 'file.save', title: 'Save + Build + Snapshot', shortcut: 'Ctrl+S', run: () => { void (async () => { await ops().formatActive(); await ops().runAssemble(); ops().onSnapshot() })() } },
    { id: 'run.start', title: 'Run', shortcut: 'Ctrl+Enter', when: () => st().canRun && !st().running, run: () => { void ops().onRun() } },
    { id: 'run.restart', title: 'Restart', shortcut: 'Ctrl+Shift+Enter', when: () => st().canRun, run: () => { void ops().onReset() } },
    { id: 'run.pause', title: 'Pause', shortcut: 'Ctrl+.', when: () => st().running, run: () => ops().onPause() },
    { id: 'run.stop', title: 'Stop', shortcut: 'Ctrl+Shift+.', when: () => st().hasEmu, run: () => ops().onStop() },
    { id: 'debug.step', title: 'Step Instruction', shortcut: 'F10', when: () => !st().running && st().hasEmu, run: () => ops().onStep() },
    { id: 'debug.frame', title: 'Step Frame', shortcut: 'F11', when: () => !st().running && st().hasEmu, run: () => ops().onStepFrame() },
    { id: 'debug.toggleBreakpoint', title: 'Toggle Breakpoint at Cursor', shortcut: 'F9', run: () => ops().toggleBpAtCursor() },
    // Directional pane focus (#27) — tiling-WM style. Alt+Shift dodges the
    // CodeMirror word-nav (Mod+Arrow) and browser back/forward (Alt+Arrow)
    // conflicts; the canvas key handler ignores Alt-modified keys so leaving the
    // emulator works too.
    { id: 'focus.paneLeft', title: 'Focus pane: left', shortcut: 'Alt+Shift+Left', run: () => focusPaneInDirection('left') },
    { id: 'focus.paneRight', title: 'Focus pane: right', shortcut: 'Alt+Shift+Right', run: () => focusPaneInDirection('right') },
    { id: 'focus.paneUp', title: 'Focus pane: up', shortcut: 'Alt+Shift+Up', run: () => focusPaneInDirection('up') },
    { id: 'focus.paneDown', title: 'Focus pane: down', shortcut: 'Alt+Shift+Down', run: () => focusPaneInDirection('down') },
  ]
}
