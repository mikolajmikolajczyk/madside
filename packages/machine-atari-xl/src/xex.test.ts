import { describe, expect, it } from 'vitest'
import { parseXexLoadRange } from './xex'

const u8 = (...n: number[]) => Uint8Array.from(n)
const lohi = (a: number) => [a & 0xff, (a >> 8) & 0xff]
const seg = (start: number, end: number, data: number[]) => [
  ...lohi(start),
  ...lohi(end),
  ...data,
]
const xex = (...parts: number[][]) => u8(0xff, 0xff, ...parts.flat())

describe('parseXexLoadRange', () => {
  it('returns the load span and run address of a simple XEX', () => {
    const bin = xex(seg(0x2000, 0x2002, [1, 2, 3]), seg(0x02e0, 0x02e1, lohi(0x2000)))
    expect(parseXexLoadRange(bin)).toEqual({ lo: 0x2000, hi: 0x2002, runAddr: 0x2000 })
  })

  it('spans multiple code segments, excluding the RUNAD control segment', () => {
    const bin = xex(
      seg(0x2000, 0x2001, [1, 2]),
      seg(0x3000, 0x30ff, new Array(0x100).fill(0)),
      seg(0x02e0, 0x02e1, lohi(0x3000)),
    )
    expect(parseXexLoadRange(bin)).toEqual({ lo: 0x2000, hi: 0x30ff, runAddr: 0x3000 })
  })

  it('rejects a non-XEX binary (no $FFFF header)', () => {
    // iNES header "NES\x1a..."
    expect(parseXexLoadRange(u8(0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0))).toBeNull()
  })

  it('handles repeated $FFFF separators between segments', () => {
    const bin = u8(0xff, 0xff, ...seg(0x2000, 0x2000, [9]), 0xff, 0xff, ...seg(0x4000, 0x4000, [9]))
    expect(parseXexLoadRange(bin)).toEqual({ lo: 0x2000, hi: 0x4000, runAddr: undefined })
  })

  it('falls back to a point range when only a RUNAD segment is present', () => {
    const bin = xex(seg(0x02e0, 0x02e1, lohi(0x2400)))
    expect(parseXexLoadRange(bin)).toEqual({ lo: 0x2400, hi: 0x2400, runAddr: 0x2400 })
  })

  it('stops gracefully on a malformed segment (end < start)', () => {
    const bin = xex(seg(0x2000, 0x2002, [1, 2, 3]), [0x00, 0x40, 0x00, 0x20])
    expect(parseXexLoadRange(bin)).toEqual({ lo: 0x2000, hi: 0x2002, runAddr: undefined })
  })

  it('returns null for too-short input', () => {
    expect(parseXexLoadRange(u8(0xff, 0xff))).toBeNull()
  })
})
