import { describe, expect, it } from 'vitest'
import { indexC, resolveType, typeOfSymbol, CC65_SIZES, type ResolvedType } from '../src/engine'

// #129 — type introspection for the debugger's DebugInfo (ADR-0011). Resolve a
// global's written type into a structured, packed byte layout (cc65 sizes).

const idx = (src: string) => indexC([{ path: 'main.c', text: src }])
const typeOf = (src: string, name: string) => typeOfSymbol(idx(src), name, CC65_SIZES)

describe('typeOfSymbol — scalars', () => {
  it('int → 2-byte signed', () => {
    expect(typeOf('int score;', 'score')).toEqual({ kind: 'scalar', bytes: 2, signed: true, repr: 'int' })
  })
  it('unsigned char → 1-byte unsigned char', () => {
    expect(typeOf('unsigned char c;', 'c')).toEqual({ kind: 'scalar', bytes: 1, signed: false, repr: 'char' })
  })
  it('long → 4-byte', () => {
    expect(typeOf('long big;', 'big')).toMatchObject({ kind: 'scalar', bytes: 4 })
  })
})

describe('typeOfSymbol — pointers', () => {
  it('char * → 2-byte pointer to char', () => {
    const t = typeOf('char *p;', 'p')
    expect(t).toMatchObject({ kind: 'pointer', bytes: 2 })
    expect((t as { to: ResolvedType }).to).toMatchObject({ kind: 'scalar', repr: 'char' })
  })
})

describe('typeOfSymbol — struct layout (packed)', () => {
  it('computes field offsets + total size', () => {
    const t = typeOf('struct Point { int x; int y; }; struct Point pt;', 'pt')
    expect(t).toMatchObject({ kind: 'struct', name: 'Point', bytes: 4 })
    const fields = (t as Extract<ResolvedType, { kind: 'struct' }>).fields
    expect(fields.map((f) => [f.name, f.offset])).toEqual([['x', 0], ['y', 2]])
  })

  it('nests structs by value', () => {
    const src = 'struct P { int x; int y; }; struct R { struct P a; struct P b; }; struct R r;'
    const t = typeOf(src, 'r') as Extract<ResolvedType, { kind: 'struct' }>
    expect(t.bytes).toBe(8)
    expect(t.fields.map((f) => [f.name, f.offset])).toEqual([['a', 0], ['b', 4]])
  })

  it('mixes widths (char + int)', () => {
    const t = typeOf('struct M { char a; int b; char c; }; struct M m;', 'm') as Extract<ResolvedType, { kind: 'struct' }>
    expect(t.bytes).toBe(4)
    expect(t.fields.map((f) => [f.name, f.offset])).toEqual([['a', 0], ['b', 1], ['c', 3]])
  })
})

describe('typeOfSymbol — union / enum / typedef', () => {
  it('union: all fields at 0, size = max', () => {
    const t = typeOf('union U { int i; char c; }; union U u;', 'u') as Extract<ResolvedType, { kind: 'union' }>
    expect(t).toMatchObject({ kind: 'union', bytes: 2 })
    expect(t.fields.every((f) => f.offset === 0)).toBe(true)
  })
  it('enum → int-sized', () => {
    expect(typeOf('enum E { A, B }; enum E e;', 'e')).toMatchObject({ kind: 'enum', bytes: 2 })
  })
  it('typedef to a primitive', () => {
    expect(typeOf('typedef unsigned char u8; u8 b;', 'b')).toMatchObject({ kind: 'scalar', bytes: 1, signed: false })
  })
})

describe('arrays — exact size + struct offsets (the silent-wrong cases)', () => {
  it('int arr[10] → array of 10 int, 20 bytes', () => {
    const t = typeOf('int arr[10];', 'arr') as Extract<ResolvedType, { kind: 'array' }>
    expect(t).toMatchObject({ kind: 'array', count: 10, bytes: 20 })
    expect(t.of).toMatchObject({ kind: 'scalar', repr: 'int' })
  })
  it('a field after an array gets the right offset', () => {
    const t = typeOf('struct S { int a[3]; int b; }; struct S s;', 's') as Extract<ResolvedType, { kind: 'struct' }>
    expect(t.bytes).toBe(8) // int[3]=6 + int=2
    expect(t.fields.map((f) => [f.name, f.offset])).toEqual([['a', 0], ['b', 6]])
  })
  it('2D array', () => {
    const t = typeOf('char grid[2][3];', 'grid') as Extract<ResolvedType, { kind: 'array' }>
    expect(t).toMatchObject({ kind: 'array', count: 2, bytes: 6 })
    expect(t.of).toMatchObject({ kind: 'array', count: 3, bytes: 3 })
  })
  it('a #define-sized array resolves its count (not 0)', () => {
    const t = typeOf('#define N 3\nint arr[N];', 'arr') as Extract<ResolvedType, { kind: 'array' }>
    expect(t).toMatchObject({ kind: 'array', count: 3, bytes: 6 })
    // The size identifier must not be confused with the declarator name.
    const a = typeOf('#define COUNT 4\nstruct P { int x; }; struct P items[COUNT];', 'items') as Extract<ResolvedType, { kind: 'array' }>
    expect(a).toMatchObject({ kind: 'array', count: 4, bytes: 8 })
  })
})

describe('per-declarator types — no pointer/array bleed', () => {
  it('int x, *p; — x is int, p is pointer', () => {
    const i = idx('int x, *p;')
    expect(typeOfSymbol(i, 'x', CC65_SIZES)).toMatchObject({ kind: 'scalar', repr: 'int' })
    expect(typeOfSymbol(i, 'p', CC65_SIZES)).toMatchObject({ kind: 'pointer' })
  })
  it('int a, arr[4]; — a is int, arr is array', () => {
    const i = idx('int a, arr[4];')
    expect(typeOfSymbol(i, 'a', CC65_SIZES)).toMatchObject({ kind: 'scalar' })
    expect(typeOfSymbol(i, 'arr', CC65_SIZES)).toMatchObject({ kind: 'array', count: 4 })
  })
})

describe('recursive types', () => {
  it('self-referential struct via pointer stays finite', () => {
    const t = typeOf('struct Node { int v; struct Node *next; }; struct Node n;', 'n') as Extract<ResolvedType, { kind: 'struct' }>
    expect(t.bytes).toBe(4) // int(2) + pointer(2)
    const next = t.fields[1]
    expect(next.type.kind).toBe('pointer')
    expect((next.type as Extract<ResolvedType, { kind: 'pointer' }>).to).toMatchObject({ kind: 'struct', name: 'Node' })
  })
})

describe('resolveType — direct', () => {
  it('unknown base falls back', () => {
    expect(resolveType(idx(''), { k: 'base', text: 'NoSuchType' }, CC65_SIZES)).toMatchObject({ kind: 'unknown' })
  })
})
