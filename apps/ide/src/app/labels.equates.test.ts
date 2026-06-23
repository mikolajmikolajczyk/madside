import { describe, expect, it } from 'vitest'
import { scanEquates } from './labels'

describe('scanEquates', () => {
  it('parses hex, zero-page, and decimal equates with line numbers', () => {
    const src = [
      'COLOR4 = $02C8',   // line 1
      'screen = $80',     // line 2
      'count  = 42',      // line 3
    ].join('\n')
    expect(scanEquates(src)).toEqual(
      new Map([
        [1, 0x02c8],
        [2, 0x80],
        [3, 42],
      ]),
    )
  })

  it('accepts 0x literals and trailing comments', () => {
    expect(scanEquates('PTR = 0xFB ; pointer')).toEqual(new Map([[1, 0xfb]]))
  })

  it('skips non-literal equates (expressions, current PC)', () => {
    const src = ['FOO = BAR+1', 'here = *', 'OK = $10'].join('\n')
    expect(scanEquates(src)).toEqual(new Map([[3, 0x10]]))
  })

  it('admits >64K addresses up to the 24-bit ceiling, skips beyond (#133/88A)', () => {
    // Forward-compat for >64K targets (68000): a 17-bit / 24-bit address is kept…
    expect(scanEquates('MID = $1FFFF')).toEqual(new Map([[1, 0x1ffff]]))
    expect(scanEquates('HI = $FFFFFF')).toEqual(new Map([[1, 0xffffff]]))
    // …but a value past 24 bits is still rejected as a non-address constant.
    expect(scanEquates('BIG = $1000000')).toEqual(new Map())
  })

  it('ignores code and label lines', () => {
    const src = ['start', '        lda #$00', '        sta $d018'].join('\n')
    expect(scanEquates(src)).toEqual(new Map())
  })
})
