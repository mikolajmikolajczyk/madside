import { describe, expect, it } from 'vitest'
import { resolveLineSpace, resolvePcLoc, type SourceMap } from './index'

// A banked build where two source lines emit at the SAME logical address
// $4005 in different banks (the 130XE LOOP0/LOOP1 ambiguity). addrToLoc keeps
// only the first (bank0); bankedAddrToLoc keeps both. (ADR-0014 Phase 1)
const SM: SourceMap = {
  addrToLoc: new Map([
    [0x4005, { file: 'game.asm', line: 8, space: 'bank0' }],
  ]),
  locToAddr: new Map([['game.asm', new Map([[8, 0x4005], [13, 0x4005]])]]),
  bankedAddrToLoc: new Map([
    [0x4005, [
      { file: 'game.asm', line: 8, space: 'bank0' },
      { file: 'game.asm', line: 13, space: 'bank1' },
    ]],
  ]),
}

describe('resolvePcLoc — live-bank current-line disambiguation', () => {
  it('picks the loc matching the live bank', () => {
    expect(resolvePcLoc(SM, 0x4005, 'bank0')).toMatchObject({ line: 8 })
    expect(resolvePcLoc(SM, 0x4005, 'bank1')).toMatchObject({ line: 13 })
  })

  it('falls back to first-wins addrToLoc when no live bank is given', () => {
    expect(resolvePcLoc(SM, 0x4005)).toMatchObject({ line: 8 })
    expect(resolvePcLoc(SM, 0x4005, null)).toMatchObject({ line: 8 })
  })

  it('falls back to addrToLoc when the live bank has no entry there', () => {
    // bank2 isn't in the index at $4005 → fall through to the flat first-wins.
    expect(resolvePcLoc(SM, 0x4005, 'bank2')).toMatchObject({ line: 8 })
  })

  it('returns undefined for an unmapped address', () => {
    expect(resolvePcLoc(SM, 0x9999, 'bank0')).toBeUndefined()
  })
})

describe('resolveLineSpace — which bank a source line is in', () => {
  it('returns the bank of a banked line', () => {
    expect(resolveLineSpace(SM, 'game.asm', 8)).toBe('bank0')
    expect(resolveLineSpace(SM, 'game.asm', 13)).toBe('bank1')
  })

  it('returns undefined for a line not in any bank', () => {
    expect(resolveLineSpace(SM, 'game.asm', 99)).toBeUndefined()
  })

  it('returns undefined for a flat build (no bankedAddrToLoc)', () => {
    const flat: SourceMap = { addrToLoc: new Map(), locToAddr: new Map() }
    expect(resolveLineSpace(flat, 'game.asm', 8)).toBeUndefined()
  })
})
