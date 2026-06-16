import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileSaver } from '../../src/app/state/file-saver'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('createFileSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces a write to the trailing edge', () => {
    const writes: Array<[string, string]> = []
    const saver = createFileSaver({ write: async (_p, path, c) => { writes.push([path, new TextDecoder().decode(c)]) }, delayMs: 500 })

    saver.sync('p', [{ path: 'a', content: bytes('1') }])
    vi.advanceTimersByTime(499)
    expect(writes).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(writes).toEqual([['a', '1']])
  })

  it('keeps only the latest content when edited repeatedly within the window', () => {
    const writes: string[] = []
    const saver = createFileSaver({ write: async (_p, _path, c) => { writes.push(new TextDecoder().decode(c)) }, delayMs: 500 })

    saver.sync('p', [{ path: 'a', content: bytes('1') }])()  // run cleanup, as the effect does on next state
    vi.advanceTimersByTime(200)
    saver.sync('p', [{ path: 'a', content: bytes('22') }])()
    vi.advanceTimersByTime(200)
    saver.sync('p', [{ path: 'a', content: bytes('333') }])
    vi.advanceTimersByTime(500)

    expect(writes).toEqual(['333'])
  })

  it('does NOT resurrect a file removed inside the debounce window', () => {
    const writes: string[] = []
    const saver = createFileSaver({ write: async (_p, path) => { writes.push(path) }, delayMs: 500 })

    // edit 'a' → schedule; the React effect cleanup runs before the next sync
    const cleanup = saver.sync('p', [{ path: 'a', content: bytes('x') }])
    cleanup()
    // next render: 'a' was deleted, no longer in the file set
    saver.sync('p', [])
    vi.advanceTimersByTime(1000)

    expect(writes).toHaveLength(0)
  })

  it('reset cancels all pending writes', () => {
    const writes: string[] = []
    const saver = createFileSaver({ write: async (_p, path) => { writes.push(path) }, delayMs: 500 })

    saver.sync('p', [{ path: 'a', content: bytes('x') }, { path: 'b', content: bytes('y') }])
    saver.reset()
    vi.advanceTimersByTime(1000)

    expect(writes).toHaveLength(0)
  })

  it('skips a write when the content matches what was last saved', async () => {
    const writes: string[] = []
    const saver = createFileSaver({ write: async (_p, path) => { writes.push(path) }, delayMs: 500 })

    saver.sync('p', [{ path: 'a', content: bytes('x') }])
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync() // let the write().then settle lastSaved
    expect(writes).toEqual(['a'])

    // same bytes again → no second write
    saver.sync('p', [{ path: 'a', content: bytes('x') }])
    vi.advanceTimersByTime(500)
    expect(writes).toEqual(['a'])
  })
})
