import { describe, expect, it } from 'vitest'
import { bpsToRecord, recordToBps, type BreakpointsMap } from './breakpoints'

describe('breakpoints — Map<->Record conversion', () => {
  it('round-trips empty', () => {
    const bps: BreakpointsMap = new Map()
    expect(bpsToRecord(bps)).toEqual({})
    expect(recordToBps({}).size).toBe(0)
  })

  it('round-trips a populated map (Map → Record → Map)', () => {
    const bps: BreakpointsMap = new Map([
      ['src/main.a65', new Set([12, 5, 30])],
      ['src/atari.a65', new Set([42])],
    ])
    const rec = bpsToRecord(bps)
    expect(rec).toEqual({
      'src/main.a65': [5, 12, 30],
      'src/atari.a65': [42],
    })
    const back = recordToBps(rec)
    expect(back.get('src/main.a65')).toEqual(new Set([5, 12, 30]))
    expect(back.get('src/atari.a65')).toEqual(new Set([42]))
  })

  it('drops empty files on both directions', () => {
    const bps: BreakpointsMap = new Map([
      ['src/main.a65', new Set([1])],
      ['src/empty.a65', new Set()],
    ])
    const rec = bpsToRecord(bps)
    expect('src/empty.a65' in rec).toBe(false)

    const recWithEmpty: Record<string, number[]> = {
      'src/main.a65': [1],
      'src/empty.a65': [],
    }
    const back = recordToBps(recWithEmpty)
    expect(back.has('src/empty.a65')).toBe(false)
  })

  it('Record line arrays are sorted ascending for stable storage', () => {
    const bps: BreakpointsMap = new Map([['src/main.a65', new Set([99, 1, 50])]])
    expect(bpsToRecord(bps)['src/main.a65']).toEqual([1, 50, 99])
  })
})
