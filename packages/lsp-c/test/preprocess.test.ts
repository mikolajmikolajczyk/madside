import { describe, expect, it } from 'vitest'
import { preprocess } from '../src/engine/preprocess'
import { indexC } from '../src/engine'

describe('preprocess — conditional evaluation (#30)', () => {
  it('keeps the active branch and blanks the inactive one (offset-preserving)', () => {
    const text = [
      '#if defined(__C64__)',
      '#define COLOR 1',
      '#else',
      '#define COLOR 2',
      '#endif',
    ].join('\n')
    const { stripped } = preprocess(text, { __C64__: '1' })
    expect(stripped).toContain('#define COLOR 1')
    expect(stripped).not.toContain('#define COLOR 2')
    // length preserved so symbol offsets stay valid
    expect(stripped.length).toBe(text.length)
  })

  it('flips with the opposite define', () => {
    const text = '#if defined(__C64__)\nint a;\n#else\nint b;\n#endif'
    expect(preprocess(text, { __ATARI__: '1' }).stripped).toContain('int b;')
    expect(preprocess(text, { __ATARI__: '1' }).stripped).not.toContain('int a;')
  })

  it('tags #include directives active / inactive by branch', () => {
    const text = [
      '#if defined(__AGAT__)',
      '#include <agat.h>',
      '#elif defined(__CBM__)',
      '#include <cbm.h>',
      '#endif',
    ].join('\n')
    const { includes } = preprocess(text, { __CBM__: '1' })
    const byName = Object.fromEntries(includes.map((i) => [i.name, i.active]))
    expect(byName['agat.h']).toBe(false)
    expect(byName['cbm.h']).toBe(true)
  })

  it('handles #ifdef / #ifndef and !, && , ||', () => {
    const yes = preprocess('#ifdef X\nint a;\n#endif', { X: '1' }).stripped
    expect(yes).toContain('int a;')
    const no = preprocess('#ifndef X\nint a;\n#endif', { X: '1' }).stripped
    expect(no).not.toContain('int a;')
    const and = preprocess('#if defined(A) && defined(B)\nint a;\n#endif', {
      A: '1',
      B: '1',
    }).stripped
    expect(and).toContain('int a;')
    const or = preprocess('#if defined(A) || defined(B)\nint a;\n#endif', { B: '1' }).stripped
    expect(or).toContain('int a;')
  })
})

describe('indexC — preprocessor-aware target gating (#30)', () => {
  // The cc65 shape: <target.h> picks the platform header via #if defined; only
  // the active target's header should reach the index.
  const sysrootHeaders = [
    { path: 'include/conio.h', text: '#include <target.h>\nvoid clrscr(void);' },
    {
      path: 'include/target.h',
      text: '#if defined(__APPLE2__)\n#include <apple2.h>\n#elif defined(__AGAT__)\n#include <agat.h>\n#elif defined(__CBM__)\n#include <cbm.h>\n#endif',
    },
    { path: 'include/cbm.h', text: '#if defined(__C64__)\n#include <c64.h>\n#endif' },
    // agat.h (Apple II clone) unconditionally pulls apple2.h — apple2.h must
    // still be excluded, since agat.h itself is unreachable on a C64 build.
    {
      path: 'include/agat.h',
      text: '#include <apple2.h>\n#define COLOR_GREEN 0x42\nstruct agat_io { int x; };',
    },
    { path: 'include/apple2.h', text: '#define COLOR_WHITE 0x0f\nstruct apple2_io { int y; };' },
    {
      path: 'include/c64.h',
      text: '#define COLOR_GREEN 0x05\nstruct __vic2 { unsigned char bordercolor; };',
    },
  ]
  const main = { path: 'src/main.c', text: '#include <conio.h>\nvoid main(void) {}' }

  it('indexes the active target header, drops the other target one', () => {
    const idx = indexC([main], { sysrootHeaders, defines: { __C64__: '1', __CBM__: '1' } })
    // c64.h reached through the active include chain
    expect(idx.types.has('__vic2')).toBe(true)
    expect(idx.symbols.has('clrscr')).toBe(true)
    // agat.h is only inactive-included → excluded (no cross-target pollution)
    expect(idx.types.has('agat_io')).toBe(false)
    // apple2.h is reachable ONLY through the excluded agat.h → also excluded
    expect(idx.types.has('apple2_io')).toBe(false)
    expect(idx.symbols.has('COLOR_WHITE')).toBe(false)
    // COLOR_GREEN resolves to the c64 value, not the agat one
    expect(idx.symbols.get('COLOR_GREEN')?.file).toBe('c64.h')
  })

  it('legacy path (no defines) still indexes everything', () => {
    const idx = indexC([main], { sysrootHeaders })
    expect(idx.types.has('__vic2')).toBe(true)
    expect(idx.types.has('agat_io')).toBe(true)
  })
})
