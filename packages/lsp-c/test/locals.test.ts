import { describe, expect, it } from 'vitest'
import { functionLocals, indexC, resolveType, CC65_SIZES } from '../src/engine'

// #131 — function-local introspection for the debugger's frame view. Pulls a
// function's parameters + body declarations (block-nested folded in) with their
// structured DType, which the toolchain joins by name against the .dbg frame
// offsets. Same DType → laid-out type path as globals (#129).

const names = (ls: { name: string }[]) => ls.map((l) => l.name)

describe('functionLocals', () => {
  it('captures params + body declarations in order', () => {
    const src = `int add(int a, int b) {\n  int sum = a + b;\n  return sum;\n}\n`
    expect(names(functionLocals(src, 'add'))).toEqual(['a', 'b', 'sum'])
  })

  it('folds block-nested declarations into the function (matches cc65 autos)', () => {
    const src = `int f(int n) {\n  int acc = 0;\n  for (int i = 0; i < n; i++) {\n    int t = i * 2;\n    acc += t;\n  }\n  return acc;\n}\n`
    expect(names(functionLocals(src, 'f'))).toEqual(['n', 'acc', 'i', 't'])
  })

  it('returns [] for a function not defined here', () => {
    expect(functionLocals(`int g(void) { return 0; }`, 'nope')).toEqual([])
  })

  it('finds locals of a pointer-returning function (#137 — declarator nesting)', () => {
    const src = `char *get_name(int id) {\n  char *p;\n  int n;\n  return p;\n}\n`
    expect(names(functionLocals(src, 'get_name'))).toEqual(['id', 'p', 'n'])
  })

  it('finds locals of a struct-pointer-returning function', () => {
    const src = `struct Node { int v; };\nstruct Node *head(int k) {\n  struct Node *cur;\n  return cur;\n}\n`
    expect(names(functionLocals(src, 'head'))).toEqual(['k', 'cur'])
  })

  it('carries exact pointer/array shape (no declarator bleed)', () => {
    const src = `void h(void) {\n  int x, *p;\n  char buf[8];\n}\n`
    const ls = functionLocals(src, 'h')
    const index = indexC([{ path: 'm.c', text: src }])
    const typeOf = (n: string) => resolveType(index, ls.find((l) => l.name === n)!.dtype, CC65_SIZES)
    expect(typeOf('x')).toMatchObject({ kind: 'scalar', bytes: 2 })
    expect(typeOf('p')).toMatchObject({ kind: 'pointer', bytes: 2 })
    expect(typeOf('buf')).toMatchObject({ kind: 'array', count: 8, bytes: 8 })
  })

  it('resolves a struct local to a packed layout', () => {
    const src = `struct Point { int x; int y; };\nint c(int n) {\n  struct Point pt;\n  return n;\n}\n`
    const ls = functionLocals(src, 'c')
    const index = indexC([{ path: 'm.c', text: src }])
    const pt = resolveType(index, ls.find((l) => l.name === 'pt')!.dtype, CC65_SIZES)
    expect(pt).toMatchObject({ kind: 'struct', name: 'Point', bytes: 4 })
  })
})
