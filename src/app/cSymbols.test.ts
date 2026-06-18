import { describe, expect, it } from 'vitest'
import { scanCSymbols } from './cSymbols'

const labels = (src: string) =>
  Object.fromEntries(scanCSymbols(src, 'f.c').map((s) => [s.label, s.kind]))

describe('scanCSymbols', () => {
  it('finds function definitions and prototypes, not calls', () => {
    const src = [
      'void greet(const char* s);',          // prototype
      'unsigned char add(int a, int b) {',   // definition
      '    return a + b;',
      '}',
      'int main(void) {',
      '    greet("hi");',                     // a call — indented, must be ignored
      '    return 0;',
      '}',
    ].join('\n')
    expect(labels(src)).toEqual({ greet: 'function', add: 'function', main: 'function' })
  })

  it('finds #define macros', () => {
    expect(labels('#define WIDTH 32\n  #  define HEIGHT 24')).toEqual({
      WIDTH: 'macro',
      HEIGHT: 'macro',
    })
  })

  it('finds typedef names (plain and struct-body)', () => {
    const src = [
      'typedef unsigned char u8;',
      'typedef struct { int x; int y; } Point;',
    ].join('\n')
    expect(labels(src)).toEqual({ u8: 'type', Point: 'type' })
  })

  it('excludes C keywords', () => {
    // `if (...)` and `while (...)` look like `name(` but must not be symbols.
    const src = 'void f(void) {\nif (x) return;\nwhile (y) {}\n}'
    expect(labels(src)).toEqual({ f: 'function' })
  })

  it('attaches the file basename to each symbol', () => {
    const [sym] = scanCSymbols('void f(void);', 'helper.c')
    expect(sym).toEqual({ label: 'f', kind: 'function', file: 'helper.c' })
  })
})
