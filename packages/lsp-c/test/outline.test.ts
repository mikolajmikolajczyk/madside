import { describe, expect, it } from 'vitest'
import { documentSymbols } from '../src/engine'

const SRC = `int score;
int lives, level;
struct Foo { int x; char *name; };
union U { int a; char b; };
enum Color { RED, GREEN };
typedef struct Foo *FooRef;
typedef struct { int z; } Bar;
void proto(int a);
void run(void) { int local; }
`

describe('documentSymbols', () => {
  const syms = documentSymbols(SRC)
  const byName = (name: string) => syms.find((s) => s.name === name)

  it('lists every top-level declaration with its kind', () => {
    const got = syms.map((s) => `${s.kind}:${s.name}`)
    expect(got).toEqual([
      'variable:score',
      'variable:lives',
      'variable:level',
      'struct:Foo',
      'union:U',
      'enum:Color',
      'typedef:FooRef',
      'typedef:Bar',
      'function:proto',
      'function:run',
    ])
  })

  it('does not leak locals from function bodies', () => {
    expect(byName('local')).toBeUndefined()
  })

  it('reports a full range and a name selection range', () => {
    const foo = byName('Foo')!
    // selection range covers exactly the tag `Foo`
    expect(SRC.slice(foo.selectionStart, foo.selectionEnd)).toBe('Foo')
    // full range covers the whole struct definition
    expect(SRC.slice(foo.start, foo.end)).toContain('struct Foo { int x; char *name; }')
    expect(foo.selectionStart).toBeGreaterThanOrEqual(foo.start)
    expect(foo.selectionEnd).toBeLessThanOrEqual(foo.end)
  })

  it('points a function selection range at its name', () => {
    const run = byName('run')!
    expect(SRC.slice(run.selectionStart, run.selectionEnd)).toBe('run')
  })

  it('returns an empty list for a file with no declarations', () => {
    expect(documentSymbols('// just a comment\n')).toEqual([])
  })
})
