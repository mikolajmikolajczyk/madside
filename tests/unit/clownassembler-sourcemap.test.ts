// Unit test for the clownassembler listing → SourceMap parser (#145, Phase B).
// Pure function (no wasm) — feeds a real-shaped listing where an `include`
// expands two equate lines inline, and asserts main-file lines stay correctly
// attributed across the include (no positional drift) and equates are skipped.

import { describe, expect, it } from 'vitest'
import { parseListingSourceMap } from '@madside/toolchain-clownassembler'

// src/main.asm (1-based):
//   1: ; comment line
//   2: (blank)
//   3: \tinclude\t"inc.i"
//   4: start:
//   5: \tmove.w\t#FOO,d0   -> emits at $0
//   6: (blank)
//   7: \tnop               -> emits at $4
//   8: loop:
//   9: \tbra\tloop         -> emits at $6
const MAIN = '; comment line\n\n\tinclude\t"inc.i"\nstart:\n\tmove.w\t#FOO,d0\n\n\tnop\nloop:\n\tbra\tloop\n'
// inc.i: two equates (don't emit bytes)
const INC = 'FOO\tequ\t$10\nBAR\tequ\t$20\n'

// The listing clownassembler produces for the above (include expanded inline).
const LISTING = [
  '00000000                            ; comment line',
  '00000000                            ',
  '00000000                            \tinclude\t"inc.i"',
  '00000000 =00000010                  FOO\tequ\t$10',
  '00000000 =00000020                  BAR\tequ\t$20',
  '00000000                            start:',
  '00000000 303C 0010                  \tmove.w\t#FOO,d0',
  '00000004                            ',
  '00000004 4E71                       \tnop',
  '00000006                            loop:',
  '00000006 6000 FFFE                  \tbra\tloop',
].join('\n')

describe('parseListingSourceMap', () => {
  const files = [
    { path: 'src/main.asm', content: MAIN },
    { path: 'src/inc.i', content: INC },
  ]
  const sm = parseListingSourceMap(LISTING, files, 'src/main.asm')

  it('attributes main-file lines across an inline-expanded include', () => {
    const main = sm.locToAddr.get('src/main.asm')!
    expect(main.get(5)).toBe(0x0) // move.w — NOT shifted by the 2 include lines
    expect(main.get(7)).toBe(0x4) // nop
    expect(main.get(9)).toBe(0x6) // bra
  })

  it('maps addresses back to the first emitting source location', () => {
    expect(sm.addrToLoc.get(0x0)).toEqual({ file: 'src/main.asm', line: 5 })
    expect(sm.addrToLoc.get(0x4)).toEqual({ file: 'src/main.asm', line: 7 })
    expect(sm.addrToLoc.get(0x6)).toEqual({ file: 'src/main.asm', line: 9 })
  })

  it('skips equates, labels, blanks, and comments (non-emitting lines)', () => {
    // inc.i is all equates -> contributes no addresses.
    expect(sm.locToAddr.has('src/inc.i')).toBe(false)
    // main lines 1-4, 6, 8 (comment/blank/include/label) emit nothing.
    const main = sm.locToAddr.get('src/main.asm')!
    for (const n of [1, 2, 3, 4, 6, 8]) expect(main.has(n)).toBe(false)
  })
})
