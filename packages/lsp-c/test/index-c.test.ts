import { describe, expect, it } from 'vitest'
import { indexC } from '../src/engine'

// Type extraction from the Lezer C tree (the Tier-1 foundation): struct / union
// definitions and typedef'd structs → field lists, each field carrying its own
// type so nested member chains can resolve later.

describe('indexC — type extraction', () => {
  it('extracts a named struct with field names + types (incl. pointers)', () => {
    const idx = indexC([
      { path: 'src/main.c', text: 'struct Foo { int x; char *name; unsigned char flags; };' },
    ])
    const foo = idx.types.get('Foo')
    expect(foo).toBeDefined()
    expect(foo!.kind).toBe('struct')
    expect(foo!.fields.map((f) => f.name)).toEqual(['x', 'name', 'flags'])
    const byName = Object.fromEntries(foo!.fields.map((f) => [f.name, f.type]))
    expect(byName.x).toBe('int')
    expect(byName.name).toBe('char *')
    expect(byName.flags).toBe('unsigned char')
  })

  it('extracts a typedef struct under its alias', () => {
    const idx = indexC([{ path: 'lib/types.h', text: 'typedef struct { int a; int b; } Bar;' }])
    const bar = idx.types.get('Bar')
    expect(bar).toBeDefined()
    expect(bar!.kind).toBe('typedef')
    expect(bar!.fields.map((f) => f.name)).toEqual(['a', 'b'])
    expect(bar!.file).toBe('types.h')
  })

  it('indexes sysroot headers alongside project files', () => {
    const idx = indexC([{ path: 'src/main.c', text: 'struct Foo g;' }], {
      sysrootHeaders: [{ path: 'include/foo.h', text: 'struct Foo { int v; };' }],
    })
    expect(idx.types.get('Foo')?.fields[0]?.name).toBe('v')
  })

  it('first definition of a name wins (project + headers deduped by caller order)', () => {
    const idx = indexC([
      { path: 'a.c', text: 'struct T { int first; };' },
      { path: 'b.c', text: 'struct T { int second; };' },
    ])
    expect(idx.types.get('T')?.fields[0]?.name).toBe('first')
  })
})

// #137 — pointer-returning functions must reach the symbol table. The Lezer tree
// nests the FunctionDeclarator under a PointerDeclarator for a pointer return, so
// a direct getChild misses it; a function-pointer *variable* must stay a variable.
describe('indexC — function declarator shapes (#137)', () => {
  it('indexes a pointer-returning function definition', () => {
    const idx = indexC([{ path: 'm.c', text: 'char *get_name(int id) { return 0; }' }])
    expect(idx.symbols.get('get_name')?.kind).toBe('function')
    expect(idx.symbols.get('get_name')?.params).toEqual(['int id'])
  })

  it('indexes a pointer-returning function prototype (not as a variable)', () => {
    const idx = indexC([{ path: 'm.c', text: 'void *malloc(unsigned n);' }])
    expect(idx.symbols.get('malloc')?.kind).toBe('function')
  })

  it('indexes a struct-pointer-returning function', () => {
    const idx = indexC([{ path: 'm.c', text: 'struct Node *head(void) { return 0; }' }])
    expect(idx.symbols.get('head')?.kind).toBe('function')
  })

  it('does NOT mistake a function-pointer variable for a function', () => {
    // `int (*handler)(int a)` has a top-level FunctionDeclarator wrapping a
    // ParenthesizedDeclarator (no direct Identifier), so it must not be indexed
    // as a function. (It isn't indexed as a variable either — declaredVars
    // doesn't model fp-declarators — a separate pre-existing limitation.)
    const idx = indexC([{ path: 'm.c', text: 'int (*handler)(int a);' }])
    expect(idx.symbols.get('handler')?.kind).not.toBe('function')
  })

  it('plain (non-pointer) functions keep working', () => {
    const idx = indexC([{ path: 'm.c', text: 'int plain(void) { return 0; }' }])
    expect(idx.symbols.get('plain')?.kind).toBe('function')
  })
})
