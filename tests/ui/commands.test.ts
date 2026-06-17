import { describe, expect, it } from 'vitest'
import { createCommandRegistry } from '@services'
import { eventToShortcut, fuzzyFilter, visibleCommands, type ShortcutEvent } from '@ui/commands'
import type { Command } from '@ports'

const ev = (code: string, mods: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  code,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})

describe('eventToShortcut', () => {
  it('formats modifier + key the way Command.shortcut is written', () => {
    expect(eventToShortcut(ev('Enter', { ctrlKey: true }))).toBe('Ctrl+Enter')
    expect(eventToShortcut(ev('KeyB', { ctrlKey: true }))).toBe('Ctrl+B')
    expect(eventToShortcut(ev('KeyK', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(eventToShortcut(ev('KeyP', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P')
    expect(eventToShortcut(ev('F10'))).toBe('F10')
  })

  it('reads the physical key (code), so Shift+. stays "." not ">"', () => {
    expect(eventToShortcut(ev('Period', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+.')
  })

  it('treats Cmd (meta) as Ctrl so one binding serves both', () => {
    expect(eventToShortcut(ev('Enter', { metaKey: true }))).toBe('Ctrl+Enter')
  })

  it('returns null for keys we never bind', () => {
    expect(eventToShortcut(ev('Tab'))).toBeNull()
    expect(eventToShortcut(ev('Home'))).toBeNull()
  })

  it('tokenizes arrows for directional pane focus (#27)', () => {
    expect(eventToShortcut(ev('ArrowLeft', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+Left')
    expect(eventToShortcut(ev('ArrowRight', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+Right')
    expect(eventToShortcut(ev('ArrowUp', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+Up')
    expect(eventToShortcut(ev('ArrowDown', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+Down')
  })
})

const cmd = (id: string, title: string, when?: Command['when']): Command => ({
  id,
  title,
  when,
  run: () => {},
})

describe('visibleCommands', () => {
  const ctx = { projectId: 'p1' }

  it('keeps commands whose when(ctx) passes (or is absent)', () => {
    const list = [
      cmd('a', 'Always'),
      cmd('b', 'Gated on', () => true),
      cmd('c', 'Gated off', () => false),
    ]
    expect(visibleCommands(list, ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('drops excluded ids (e.g. the palette toggle itself)', () => {
    const list = [cmd('view.commandPalette', 'Palette'), cmd('a', 'Build')]
    expect(visibleCommands(list, ctx, new Set(['view.commandPalette'])).map((c) => c.id)).toEqual(['a'])
  })
})

describe('fuzzyFilter', () => {
  const list = [cmd('run', 'Run'), cmd('restart', 'Restart'), cmd('step', 'Step Instruction'), cmd('build', 'Build')]

  it('empty query returns input order unchanged', () => {
    expect(fuzzyFilter(list, '').map((c) => c.id)).toEqual(['run', 'restart', 'step', 'build'])
  })

  it('matches subsequences and ranks tighter/earlier first', () => {
    // 'run' is a subsequence of both "Run" and "Step Inst(r)(u)ctio(n)"; the
    // exact prefix ranks first.
    expect(fuzzyFilter(list, 'run').map((c) => c.id)[0]).toBe('run')
    const r = fuzzyFilter(list, 'st').map((c) => c.id)
    expect(r).toContain('step')
    expect(r).toContain('restart')
    expect(r).not.toContain('run')
  })

  it('drops non-matches', () => {
    expect(fuzzyFilter(list, 'zzz')).toEqual([])
  })
})

describe('palette dispatch through the registry (plugin commands included)', () => {
  it('a registry-registered command (as a panel/plugin would add) surfaces + runs', async () => {
    const reg = createCommandRegistry()
    let ran = false
    // A panel receives the same registry via PanelContext.commands; this mimics
    // a plugin contributing a command.
    reg.register({ id: 'plugin.hello', title: 'Plugin Hello', run: () => { ran = true } })

    const ctx = { projectId: 'p1' }
    const visible = visibleCommands(reg.list(), ctx, new Set(['view.commandPalette']))
    expect(visible.map((c) => c.id)).toContain('plugin.hello')

    // The palette dispatches the same way the shortcuts do.
    await reg.run('plugin.hello', ctx)
    expect(ran).toBe(true)
  })
})
