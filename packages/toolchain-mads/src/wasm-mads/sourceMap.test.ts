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

// Nested includes: main → a → b, each emitting code. MADS does NOT re-emit
// `Source:` when an icl returns, and numbers lines per-file from 1 — so after
// b's tail (line 4) the parent resumes at a HIGHER number (main line 7). The
// parser must pop through EVERY ancestor whose file ended (b has 4 lines, a has
// 5), not just the immediate parent, or the parent's line leaks into b.
// (Real mads.wasm output shape — no synthetic return markers.)
const NESTED_MAIN = "    org $2000\nstart\n    jsr subA\n    jsr subB\n    jmp start\n    icl 'a.a65'\n    run start\n"
const NESTED_A = "subA\n    lda #1\n    sta $d01a\n    rts\n    icl 'b.a65'\n"
const NESTED_B = "subB\n    lda #2\n    sta $d01b\n    rts\n"
const NESTED_LST = [
  'Source: main.a65',
  '     1                          org $2000',
  '     2                          start',
  '     3 2000 20 09 20            jsr subA',
  '     4 2003 20 0F 20            jsr subB',
  '     5 2006 4C 00 20            jmp start',
  "     6                          icl 'a.a65'",
  'Source: a.a65',
  '     1 2009                     subA',
  '     2 2009 A9 01               lda #1',
  '     3 200B 8D 1A D0            sta $d01a',
  '     4 200E 60                  rts',
  "     5                          icl 'b.a65'",
  'Source: b.a65',
  '     1 200F                     subB',
  '     2 200F A9 02               lda #2',
  '     3 2011 8D 1B D0            sta $d01b',
  '     4 2014 60                  rts',
  '     7 02E0-02E1> 00 20         run start',
].join('\n')

describe('parseSourceMap — nested includes (icl return through ancestors)', () => {
  const files = new Map<string, string>([
    ['src/main.a65', NESTED_MAIN],
    ['src/a.a65', NESTED_A],
    ['src/b.a65', NESTED_B],
  ])
  const sm = parseSourceMap(NESTED_LST, { main: 'src/main.a65', files })

  it('keeps each include\'s emitted lines under its own file', () => {
    expect([...sm.locToAddr.get('src/a.a65')!.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4])
    expect([...sm.locToAddr.get('src/b.a65')!.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4])
  })
  it('attributes the post-include parent line back to the parent, not the deepest include', () => {
    // `run start` is main.a65 line 7 — must not leak into b.a65.
    expect(sm.locToAddr.get('src/b.a65')!.has(7)).toBe(false)
    expect(sm.locToAddr.get('src/main.a65')!.get(7)).toBe(0x02e0)
    expect(sm.addrToLoc.get(0x200f)?.file).toBe('src/b.a65')
    expect(sm.addrToLoc.get(0x02e0)?.file).toBe('src/main.a65')
  })
})

// Two sequential includes BEFORE the main code (the real "lesson with pmglib +
// sndlib" layout). Two traps here, both from mads.wasm's actual .lst:
//   - an include's first emitting line coincides with parent.icl_line+1 (icl on
//     main line 3 ⇒ include line 4), which the old parent+1 pop wrongly popped —
//     dumping the whole first include's code into main.
//   - the parent resumes after an include on a BARE blank line ("     5" with no
//     trailing content), the drop signal; if the line-number regex misses it the
//     pop is delayed and the parent's next lines leak into the include.
const SEQ_MAIN = '; header\n    org $2000\n    icl "pmglib.a65"\n    icl "sndlib.a65"\n\nstart\n    jsr pmg_setup\n    jsr snd_init\nloop\n    jmp loop\n    run start\n'
const SEQ_PMG = '; pmglib\nSDMCTL = $022F\npmg_setup\n    lda #$2e\n    sta SDMCTL\n    ldy #0\n?clr\n    sta $2000,y\n    iny\n    bne ?clr\n    rts\n'
const SEQ_SND = '; sndlib\nAUDC1 = $D201\nsnd_init\n    lda #0\n    sta AUDC1\n    rts\n'
const SEQ_LST = [
  'Source: main.a65',
  '     1 				; header',
  '     2 				    org $2000',
  '     3 				    icl "pmglib.a65"',
  'Source: pmglib.a65',
  '     1 				; pmglib',
  '     2 = 022F			SDMCTL = $022F',
  '     3 				pmg_setup',
  '     4 FFFF> 2000-201C> A9 2E	    lda #$2e',
  '     5 2002 8D 2F 02		    sta SDMCTL',
  '     6 2005 A0 00		    ldy #0',
  '     7 2007			?clr',
  '     8 2007 99 00 20		    sta $2000,y',
  '     9 200A C8			    iny',
  '    10 200B D0 FA		    bne ?clr',
  '    11 200D 60			    rts',
  '     4 200E			    icl "sndlib.a65"',
  'Source: sndlib.a65',
  '     1 				; sndlib',
  '     2 = D201			AUDC1 = $D201',
  '     3 200E			snd_init',
  '     4 200E A9 00		    lda #0',
  '     5 2010 8D 01 D2		    sta AUDC1',
  '     6 2013 60			    rts',
  '     5',
  '     6 2014			start',
  '     7 2014 20 00 20		    jsr pmg_setup',
  '     8 2017 20 0E 20		    jsr snd_init',
  '     9 201A			loop',
  '    10 201A 4C 1A 20		    jmp loop',
  '    11 02E0-02E1> 14 20		    run start',
].join('\n')

describe('parseSourceMap — sequential includes before main code (real lesson layout)', () => {
  const files = new Map<string, string>([
    ['src/main.a65', SEQ_MAIN],
    ['src/pmglib.a65', SEQ_PMG],
    ['src/sndlib.a65', SEQ_SND],
  ])
  const sm = parseSourceMap(SEQ_LST, { main: 'src/main.a65', files })

  it('gives the FIRST include its own emitted addresses (not the main file)', () => {
    const pmg = sm.locToAddr.get('src/pmglib.a65')!
    expect([...pmg.keys()].sort((a, b) => a - b)).toEqual([4, 5, 6, 8, 9, 10, 11])
    expect(pmg.get(4)).toBe(0x2000)
    expect(sm.addrToLoc.get(0x2000)?.file).toBe('src/pmglib.a65')
  })
  it('gives the second include its addresses and does not leak the parent resume into it', () => {
    const snd = sm.locToAddr.get('src/sndlib.a65')!
    expect([...snd.keys()].sort((a, b) => a - b)).toEqual([4, 5, 6])
    expect(snd.has(7)).toBe(false) // main's `jsr pmg_setup` must not land here
  })
  it('keeps the main file code after the includes', () => {
    const main = sm.locToAddr.get('src/main.a65')!
    expect(main.get(7)).toBe(0x2014) // jsr pmg_setup
    expect(main.get(8)).toBe(0x2017) // jsr snd_init
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
