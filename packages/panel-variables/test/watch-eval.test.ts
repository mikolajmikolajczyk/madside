import { describe, expect, it } from 'vitest'
import type { DebugSymbol, DebugType } from '@ports'
import { evalWatch, type ReadMem } from '../src/watch-eval'

const int: DebugType = { kind: 'scalar', bytes: 2, signed: true, endian: 'le', repr: 'int' }
const ptrTo = (to: DebugType): DebugType => ({ kind: 'pointer', bytes: 2, endian: 'le', to })
const point: DebugType = {
  kind: 'struct', name: 'Point', bytes: 4,
  fields: [{ name: 'x', offset: 0, type: int }, { name: 'y', offset: 2, type: int }],
}
const node: DebugType = {
  kind: 'struct', name: 'Node', bytes: 4,
  fields: [{ name: 'v', offset: 0, type: int }, { name: 'next', offset: 2, type: ptrTo(int) }],
}

const symbols: DebugSymbol[] = [
  { name: 'score', location: { addr: 0x2000 }, type: int },
  { name: 'pos', location: { addr: 0x2010 }, type: point },
  { name: 'arr', location: { addr: 0x2020 }, type: { kind: 'array', bytes: 8, count: 4, elem: int } },
  { name: 'pp', location: { addr: 0x2030 }, type: ptrTo(int) },
  { name: 'np', location: { addr: 0x2040 }, type: ptrTo(node) },
]

// 64K memory: pp@2030 → 2000; np@2040 → 2050; Node@2050 { v, next }.
const mem = new Uint8Array(0x10000)
const w16 = (a: number, v: number) => { mem[a] = v & 0xff; mem[a + 1] = (v >> 8) & 0xff }
w16(0x2030, 0x2000)
w16(0x2040, 0x2050)
w16(0x2050, 7) // Node.v
w16(0x2052, 0x2000) // Node.next → score
const read: ReadMem = async (a, l) => mem.subarray(a, a + l)

const at = async (expr: string) => {
  const r = await evalWatch(expr, symbols, read)
  return r.ok ? { addr: r.node.addr, kind: r.node.type.kind } : { error: r.error }
}

describe('evalWatch', () => {
  it('base symbol', async () => expect(await at('score')).toEqual({ addr: 0x2000, kind: 'scalar' }))
  it('struct member .x', async () => expect(await at('pos.x')).toEqual({ addr: 0x2010, kind: 'scalar' }))
  it('struct member', async () => expect(await at('pos.y')).toEqual({ addr: 0x2012, kind: 'scalar' }))
  it('array index', async () => expect(await at('arr[2]')).toEqual({ addr: 0x2024, kind: 'scalar' }))
  it('pointer deref', async () => expect(await at('*pp')).toEqual({ addr: 0x2000, kind: 'scalar' }))
  it('-> through pointer-to-struct', async () => expect(await at('np->v')).toEqual({ addr: 0x2050, kind: 'scalar' }))
  it('-> pointer field', async () => expect(await at('np->next')).toEqual({ addr: 0x2052, kind: 'pointer' }))
  it('chained deref', async () => expect(await at('*np->next')).toEqual({ addr: 0x2000, kind: 'scalar' }))

  it('unknown symbol → error', async () => expect(await at('nope')).toMatchObject({ error: expect.stringContaining('unknown') }))
  it('member on scalar → error', async () => expect(await at('score.x')).toMatchObject({ error: expect.stringContaining('non-struct') }))
  it('malformed → error', async () => expect(await at('1abc')).toMatchObject({ error: expect.any(String) }))
})
