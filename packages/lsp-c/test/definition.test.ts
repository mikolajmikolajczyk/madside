import { describe, expect, it } from 'vitest'
import { definitionAt, indexC } from '../src/engine'

// Cursor is marked with | in the fixture; we split on it to get text + offset.
function at(fixture: string) {
  const offset = fixture.indexOf('|')
  return { text: fixture.replace('|', ''), offset }
}

// The substring of `src` a returned location points at.
const targetText = (src: string, loc: { start: number; end: number }) =>
  src.slice(loc.start, loc.end)

describe('definitionAt', () => {
  it('jumps to a function definition from a call site', () => {
    const src = 'int add(int a, int b) { return a + b; }\nvoid f(void) { ad|d(1, 2); }'
    const { text, offset } = at(src)
    const idx = indexC([{ path: 'file:///main.c', text }])
    const loc = definitionAt(idx, text, offset)
    expect(loc?.uri).toBe('file:///main.c')
    expect(targetText(text, loc!)).toBe('add')
    // points at the definition's name, not the call site
    expect(loc!.start).toBe(text.indexOf('add'))
  })

  it('jumps to a type definition from a type-name use', () => {
    const src = 'struct Foo { int x; };\nstruct Fo|o g;'
    const { text, offset } = at(src)
    const idx = indexC([{ path: 'file:///main.c', text }])
    const loc = definitionAt(idx, text, offset)
    expect(targetText(text, loc!)).toBe('Foo')
    expect(loc!.start).toBe(text.indexOf('Foo'))
  })

  it('jumps to a struct field declaration via member access', () => {
    const src = 'struct Foo { int x; char *name; };\nstruct Foo g;\nvoid f(void){ g.na|me; }'
    const { text, offset } = at(src)
    const idx = indexC([{ path: 'file:///main.c', text }])
    const loc = definitionAt(idx, text, offset)
    expect(targetText(text, loc!)).toBe('name')
    expect(loc!.start).toBe(text.indexOf('name'))
  })

  it('resolves cross-file into a sysroot header', () => {
    const header = 'void __fastcall__ cputs (const char* s);'
    const src = 'void f(void) { cput|s("hi"); }'
    const { text, offset } = at(src)
    const idx = indexC([{ path: 'file:///main.c', text }], {
      decorators: /\b(?:__fastcall__|__cdecl__)\b/g,
      sysrootHeaders: [{ path: 'file:///sysroot/conio.h', text: header }],
    })
    const loc = definitionAt(idx, text, offset)
    expect(loc?.uri).toBe('file:///sysroot/conio.h')
    expect(targetText(header, loc!)).toBe('cputs')
  })

  it('returns null on a miss', () => {
    const src = 'int x = 1; // no|pe'
    const { text, offset } = at(src)
    const idx = indexC([{ path: 'file:///main.c', text }])
    expect(definitionAt(idx, text, offset)).toBeNull()
  })
})
