// The workbench command set. Every user action is one command — toolbar,
// keyboard shortcut, and the command palette all dispatch through these via
// `commands.run(id, ctx)`. Commands are registered once; their run/when read
// the latest app state through `get()` so they stay current without re-register
// churn (mirrors the fresh-callback pattern the old shortcut hook used).

import type { Command } from '@ports'

export interface AppCommandOps {
  runAssemble: () => Promise<unknown> | void
  onRun: () => Promise<unknown> | void
  onPause: () => void
  onStop: () => void
  onStep: () => void
  onStepFrame: () => void
  onReset: () => Promise<unknown> | void
  toggleBpAtCursor: () => void
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
    { id: 'file.save', title: 'Save + Build + Snapshot', shortcut: 'Ctrl+S', run: () => { void ops().runAssemble(); ops().onSnapshot() } },
    { id: 'run.start', title: 'Run', shortcut: 'Ctrl+Enter', when: () => st().canRun && !st().running, run: () => { void ops().onRun() } },
    { id: 'run.restart', title: 'Restart', shortcut: 'Ctrl+Shift+Enter', when: () => st().canRun, run: () => { void ops().onReset() } },
    { id: 'run.pause', title: 'Pause', shortcut: 'Ctrl+.', when: () => st().running, run: () => ops().onPause() },
    { id: 'run.stop', title: 'Stop', shortcut: 'Ctrl+Shift+.', when: () => st().hasEmu, run: () => ops().onStop() },
    { id: 'debug.step', title: 'Step Instruction', shortcut: 'F10', when: () => !st().running && st().hasEmu, run: () => ops().onStep() },
    { id: 'debug.frame', title: 'Step Frame', shortcut: 'F11', when: () => !st().running && st().hasEmu, run: () => ops().onStepFrame() },
    { id: 'debug.toggleBreakpoint', title: 'Toggle Breakpoint at Cursor', shortcut: 'F9', run: () => ops().toggleBpAtCursor() },
  ]
}
