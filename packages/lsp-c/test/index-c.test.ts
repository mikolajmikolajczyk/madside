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
