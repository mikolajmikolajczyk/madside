import { describe, expect, it } from 'vitest'
import type { DebugType } from '@ports'
import { decodeValue, typeLabel } from '../src/decode'

const bytes = (...b: number[]) => new Uint8Array(b)
const scalar = (n: number, signed: boolean, repr: 'int' | 'char' | 'bool'): DebugType => ({
  kind: 'scalar', bytes: n, signed, endian: 'le', repr,
})

describe('decodeValue — scalars (LE)', () => {
  it('unsigned int 16-bit', () => {
    expect(decodeValue(bytes(0x34, 0x12), scalar(2, false, 'int'))).toBe('4660')
  })
  it('signed int — negative via two’s complement', () => {
    expect(decodeValue(bytes(0xff, 0xff), scalar(2, true, 'int'))).toBe('-1')
  })
  it('char shows code + glyph', () => {
    expect(decodeValue(bytes(0x41), scalar(1, false, 'char'))).toBe("65 'A'")
  })
  it('non-printable char — no glyph', () => {
    expect(decodeValue(bytes(0x01), scalar(1, false, 'char'))).toBe('1')
  })
  it('bool', () => {
    expect(decodeValue(bytes(0x00), scalar(1, false, 'bool'))).toBe('false')
    expect(decodeValue(bytes(0x05), scalar(1, false, 'bool'))).toBe('true')
  })
})

describe('decodeValue — pointer / enum / aggregate', () => {
  it('pointer → hex address', () => {
    expect(decodeValue(bytes(0x00, 0x80), { kind: 'pointer', bytes: 2, endian: 'le', to: scalar(1, false, 'char') })).toBe('$8000')
  })
  it('enum → number', () => {
    expect(decodeValue(bytes(0x02, 0x00), { kind: 'enum', name: 'E', bytes: 2, signed: true, endian: 'le' })).toBe('2')
  })
  it('aggregate → null (expands into children)', () => {
    expect(decodeValue(bytes(0, 0, 0, 0), { kind: 'struct', name: 'P', bytes: 4, fields: [] })).toBeNull()
  })
})

describe('typeLabel', () => {
  it('labels common shapes', () => {
    expect(typeLabel(scalar(2, true, 'int'))).toBe('int')
    expect(typeLabel(scalar(1, false, 'char'))).toBe('unsigned char')
    expect(typeLabel({ kind: 'pointer', bytes: 2, endian: 'le', to: scalar(1, false, 'char') })).toBe('unsigned char *')
    expect(typeLabel({ kind: 'array', bytes: 20, count: 10, elem: scalar(2, true, 'int') })).toBe('int[10]')
    expect(typeLabel({ kind: 'struct', name: 'Point', bytes: 4, fields: [] })).toBe('struct Point')
  })
})
