import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from './event-bus'
import { wrapEventBusWithLogger } from './event-bus-logger'

describe('wrapEventBusWithLogger', () => {
  it('delegates emit to the base bus', () => {
    const base = createEventBus()
    const logged = wrapEventBusWithLogger(base)
    const cb = vi.fn()
    base.on('debug:step-done', cb)
    logged.emit('debug:step-done', { pc: 0x2000 })
    expect(cb).toHaveBeenCalledWith({ pc: 0x2000 })
  })

  it('delegates on/once unchanged', () => {
    const base = createEventBus()
    const logged = wrapEventBusWithLogger(base)
    const cb = vi.fn()
    const off = logged.on('debug:step-done', cb)
    logged.emit('debug:step-done', { pc: 1 })
    off()
    logged.emit('debug:step-done', { pc: 2 })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('logs every emit through console.groupCollapsed', () => {
    const base = createEventBus()
    const logged = wrapEventBusWithLogger(base)
    const group = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined)
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      logged.emit('debug:step-done', { pc: 0x2000 })
      logged.emit('debug:bp-hit', { pc: 0x3000 })
      expect(group).toHaveBeenCalledTimes(2)
      expect(groupEnd).toHaveBeenCalledTimes(2)
      expect(log).toHaveBeenCalledTimes(2)
      // Counter monotonic + event name present.
      expect(String(group.mock.calls[0]?.[0])).toMatch(/#1.*debug:step-done/)
      expect(String(group.mock.calls[1]?.[0])).toMatch(/#2.*debug:bp-hit/)
    } finally {
      group.mockRestore()
      groupEnd.mockRestore()
      log.mockRestore()
    }
  })

  it('surfaces subscriber count from the base bus', () => {
    const base = createEventBus()
    const logged = wrapEventBusWithLogger(base)
    base.on('debug:step-done', () => undefined)
    base.on('debug:step-done', () => undefined)
    const group = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined)
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      logged.emit('debug:step-done', { pc: 0 })
      expect(String(group.mock.calls[0]?.[0])).toMatch(/subs=2/)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
