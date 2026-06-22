import type { DebugType } from '@ports'
import { hex } from '@core/hex'

// Value decoding for the Variables panel (#130). Agnostic — reads the @ports
// DebugType model the toolchain fills (ADR-0011), no language knowledge. Phase 1
// decodes scalars / pointers / enums (the leaf values); aggregates render their
// shape (expanded into children in phase 2).

/** A human label for a type, e.g. `int`, `char *`, `int[10]`, `struct Point`. */
export function typeLabel(t: DebugType): string {
  switch (t.kind) {
    case 'scalar':
      return (t.signed ? '' : 'unsigned ') + (t.repr === 'char' ? 'char' : t.repr === 'bool' ? 'bool' : 'int')
    case 'pointer':
      return `${typeLabel(t.to)} *`
    case 'array':
      return `${typeLabel(t.elem)}[${t.count}]`
    case 'struct':
      return `struct ${t.name}`
    case 'union':
      return `union ${t.name}`
    case 'enum':
      return `enum ${t.name}`
    default:
      return '?'
  }
}

/** A child node spec: where it lives + its type + its slice of the parent's
 *  bytes. Used to expand struct fields / array elements (#130 step 2). */
export interface ChildNode {
  name: string
  type: DebugType
  addr: number
  bytes: Uint8Array
}

/** Max array elements shown (lazy cap — huge arrays don't render 1000s of rows). */
export const MAX_ELEMS = 64

/** True when a node can expand: aggregates (children) or pointers (deref). */
export function isExpandable(t: DebugType): boolean {
  return t.kind === 'struct' || t.kind === 'union' || t.kind === 'array' || t.kind === 'pointer'
}

/** Struct fields / array elements as child nodes, slicing `bytes` (the parent's
 *  region) by offset. Empty for non-aggregates (pointers deref separately). */
export function childNodes(t: DebugType, bytes: Uint8Array, addr: number): ChildNode[] {
  if (t.kind === 'struct' || t.kind === 'union') {
    return t.fields.map((f) => ({
      name: f.name,
      type: f.type,
      addr: addr + f.offset,
      bytes: bytes.subarray(f.offset, f.offset + f.type.bytes),
    }))
  }
  if (t.kind === 'array') {
    const elemSize = t.elem.bytes || 1
    const n = Math.min(t.count, MAX_ELEMS)
    return Array.from({ length: n }, (_, i) => ({
      name: `[${i}]`,
      type: t.elem,
      addr: addr + i * elemSize,
      bytes: bytes.subarray(i * elemSize, (i + 1) * elemSize),
    }))
  }
  return []
}

/** The address a pointer's bytes hold (its target). */
export function pointerTarget(bytes: Uint8Array, t: Extract<DebugType, { kind: 'pointer' }>): number {
  return readInt(bytes, t.bytes, false, t.endian)
}

// Read an N-byte integer from `bytes` per endianness; sign-extend when signed.
function readInt(bytes: Uint8Array, n: number, signed: boolean, endian: 'le' | 'be'): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    const b = bytes[endian === 'le' ? i : n - 1 - i] ?? 0
    v += b * 2 ** (8 * i)
  }
  if (signed && n > 0) {
    const max = 2 ** (8 * n)
    if (v >= max / 2) v -= max
  }
  return v
}

/** Decode a leaf value (scalar / pointer / enum) to a display string, or null
 *  for an aggregate (struct/union/array) — those expand into child rows. */
export function decodeValue(bytes: Uint8Array, t: DebugType): string | null {
  switch (t.kind) {
    case 'scalar': {
      if (t.repr === 'bool') return readInt(bytes, t.bytes, false, t.endian) ? 'true' : 'false'
      const n = readInt(bytes, t.bytes, t.signed, t.endian)
      if (t.repr === 'char') {
        const c = n & 0xff
        const printable = c >= 0x20 && c < 0x7f ? ` '${String.fromCharCode(c)}'` : ''
        return `${n}${printable}`
      }
      return `${n}`
    }
    case 'pointer':
      return `$${hex(readInt(bytes, t.bytes, false, t.endian), t.bytes * 2)}`
    case 'enum':
      return `${readInt(bytes, t.bytes, t.signed, t.endian)}`
    default:
      return null
  }
}
