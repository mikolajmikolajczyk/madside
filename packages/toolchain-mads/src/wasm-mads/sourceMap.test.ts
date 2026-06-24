import { describe, expect, it } from 'vitest'
import { parseSourceMap } from './sourceMap'

// Synthetic MADS .lst snippets — handcrafted to keep the test free of the
// wasm assembler. Shape matches what mads.wasm emits in practice.

const MAIN_SRC = `        icl 'lib/main.a65'
        org $2000
start
        lda #0
`

const LIB_SRC = `helper
        rts
`

const LST = [
  'Source: main.a65',                           // entry main
  '     1                          icl \'lib/main.a65\'',
  'Source: main.a65',                           // include — same basename
  '     1 D000 60                  helper rts',
  '     2',
  'Source: main.a65',                           // back to entry (synthetic)
  '     2 2000                     org $2000',
  '     3 2000                     start',
  '     4 2000 A9 00               lda #0',
].join('\n')

describe('parseSourceMap — same-basename disambiguation (30be0cf)', () => {
  it('keys by basename when no context is supplied (back-compat)', () => {
    const sm = parseSourceMap(LST)
    // Without ctx, every `Source: main.a65` shares one bucket.
    expect([...sm.locToAddr.keys()]).toEqual(['main.a65'])
  })

  it('resolves to full paths via icl reconstruction when given files + main', () => {
    const files = new Map<string, string>([
      ['src/main.a65', MAIN_SRC],
      ['src/lib/main.a65', LIB_SRC],
    ])
    const sm = parseSourceMap(LST, { main: 'src/main.a65', files })
    const keys = [...sm.locToAddr.keys()].sort()
    expect(keys).toContain('src/main.a65')
    expect(keys).toContain('src/lib/main.a65')
    // helper rts emitted from the lib file at $D000.
    const libMap = sm.locToAddr.get('src/lib/main.a65')!
    expect(libMap.get(1)).toBe(0xd000)
    // main file emission addrs come back under the main key.
    const mainMap = sm.locToAddr.get('src/main.a65')!
    expect(mainMap.get(4)).toBe(0x2000)
    // addrToLoc points at the right full path.
    expect(sm.addrToLoc.get(0xd000)?.file).toBe('src/lib/main.a65')
    expect(sm.addrToLoc.get(0x2000)?.file).toBe('src/main.a65')
  })
})

// ADR-0014 Phase 0: when a memory bank is active (lmb/nmb), mads 2.1.8 prefixes
// the .lst address with the 2-hex bank + comma ("01,2000"); bank 0 emits no
// prefix. The parser captures it as SourceLoc.space. Shape verified against real
// mads.wasm output. MADS gives no physical offset (unlike cc65's ooffs).
const BANKED_LST = [
  'Source: game.asm',
  '     1 2000                     org $2000',
  '     2 01,2000 A9 00            lda #0',          // bank 1, $2000 (2 bytes)
  '     3 02,3000 A9 01            lda #1',          // bank 2, $3000
  '     4 FFFF> 03,5000-5008> A9 + lda #2',          // bank 3, $5000 (FFFF> placeholder + range + truncation)
  '     5 4000 A9 03               lda #3',          // bank 0 → no prefix
].join('\n')

describe('parseSourceMap — banked address capture (ADR-0014 Phase 0)', () => {
  const sm = parseSourceMap(BANKED_LST)

  it('captures the bank as SourceLoc.space when present', () => {
    expect(sm.addrToLoc.get(0x2000)).toEqual({ file: 'game.asm', line: 2, space: 'bank1' })
    expect(sm.addrToLoc.get(0x2001)).toEqual({ file: 'game.asm', line: 2, space: 'bank1' })
    expect(sm.addrToLoc.get(0x3000)).toEqual({ file: 'game.asm', line: 3, space: 'bank2' })
  })

  it('takes the bank from the winning prefix through FFFF>/range/truncation', () => {
    expect(sm.addrToLoc.get(0x5000)).toEqual({ file: 'game.asm', line: 4, space: 'bank3' })
  })

  it('leaves bank-0 lines (no prefix) placement-free', () => {
    expect(sm.addrToLoc.get(0x4000)).toEqual({ file: 'game.asm', line: 5 })
  })
})

// Two source lines emitting at the SAME window address $4005 in different banks
// — the 130XE LOOP0/LOOP1 ambiguity. addrToLoc keeps the first; bankedAddrToLoc
// keeps both so the live bank disambiguates. (ADR-0014 Phase 1)
const COLLIDE_LST = [
  'Source: game.asm',
  '     8 01,4005 EA               loop0   nop',  // bank 1, $4005
  '     9 02,4005 EA               loop1   nop',  // bank 2, $4005 (same addr)
].join('\n')

describe('parseSourceMap — same-addr banked disambiguation (ADR-0014 Phase 1)', () => {
  const sm = parseSourceMap(COLLIDE_LST)

  it('addrToLoc keeps the first bank (flat behavior untouched)', () => {
    expect(sm.addrToLoc.get(0x4005)).toEqual({ file: 'game.asm', line: 8, space: 'bank1' })
  })

  it('bankedAddrToLoc keeps every bank at the colliding address', () => {
    expect(sm.bankedAddrToLoc?.get(0x4005)).toEqual([
      { file: 'game.asm', line: 8, space: 'bank1' },
      { file: 'game.asm', line: 9, space: 'bank2' },
    ])
  })
})

// A flat build never gets a bankedAddrToLoc — it stays absent.
describe('parseSourceMap — flat build omits bankedAddrToLoc', () => {
  it('is absent when nothing is banked', () => {
    const sm = parseSourceMap(LST)
    expect(sm.bankedAddrToLoc).toBeUndefined()
  })
})
