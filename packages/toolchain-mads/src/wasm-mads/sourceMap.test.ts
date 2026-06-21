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
