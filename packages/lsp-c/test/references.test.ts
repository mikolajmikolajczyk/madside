import { describe, expect, it } from 'vitest'
import { findReferences, referencesAt } from '../src/engine'

describe('findReferences / referencesAt', () => {
  it('finds a global used across multiple files', () => {
    const lib = { path: 'lib.c', text: 'int counter = 0;\nvoid bump(void) { counter++; }' }
    const main = { path: 'main.c', text: 'extern int counter;\nint read(void) { return counter; }' }
    const refs = findReferences([lib, main], 'counter')
    expect(refs.map((r) => r.uri).sort()).toEqual(['lib.c', 'lib.c', 'main.c', 'main.c'])
    // each location spans exactly the word
    for (const r of refs) {
      const text = r.uri === 'lib.c' ? lib.text : main.text
      expect(text.slice(r.start, r.end)).toBe('counter')
    }
  })

  it('resolves the identifier under the cursor', () => {
    const main = {
      path: 'main.c',
      text: 'void draw(void);\nvoid frame(void) {\n  draw();\n  draw();\n}',
    }
    // cursor on the call `draw` on line 2
    const offset = main.text.indexOf('draw();') + 1
    const refs = referencesAt([main], main.text, offset)
    // declaration + two calls
    expect(refs).toHaveLength(3)
  })

  it('returns empty when the cursor is not on an identifier', () => {
    const f = { path: 'f.c', text: 'int x = 1 + 2;' }
    const offset = f.text.indexOf('+')
    expect(referencesAt([f], f.text, offset)).toEqual([])
  })

  it('matches struct field references by name (documented over-match)', () => {
    const f = {
      path: 'f.c',
      text: 'struct P { int x; };\nvoid m(struct P p) {\n  p.x = 1;\n  p.x = 2;\n}',
    }
    // field decl `x` + two `.x` uses
    expect(findReferences([f], 'x')).toHaveLength(3)
  })
})
