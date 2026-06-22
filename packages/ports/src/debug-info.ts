// DebugInfo (ADR-0011) — the toolchain-supplied, language-agnostic typed-symbol
// model the debugger's Variables panel consumes. The toolchain produces it at
// build time by joining its symbol addresses with types from a source of its
// choice (cc65/z88dk reuse @madside/lsp-c behind this port); the panel + decoder
// read it without importing any language package.
//
// Address-space-aware + width/endianness-carrying by design, so the 16-bit-bus
// debt (#88/#133) doesn't grow and a future >64K/banked target slots in.

/** Where a symbol lives. `space` names a non-default address space / bank;
 *  omitted = the single CPU space (every current ≤64K machine). */
export interface DebugLocation {
  addr: number
  space?: string
}

/** A laid-out type. Language-neutral kinds so any toolchain/language maps onto
 *  it. Sizes + endianness are target-supplied (cc65/sccz80 = little-endian). */
export type DebugType =
  | { kind: 'scalar'; bytes: number; signed: boolean; endian: 'le' | 'be'; repr: 'int' | 'char' | 'bool' }
  | { kind: 'pointer'; bytes: number; endian: 'le' | 'be'; to: DebugType }
  | { kind: 'array'; bytes: number; count: number; elem: DebugType }
  | { kind: 'struct' | 'union'; name: string; bytes: number; fields: DebugField[] }
  | { kind: 'enum'; name: string; bytes: number; signed: boolean; endian: 'le' | 'be' }
  | { kind: 'unknown'; bytes: number }

export interface DebugField {
  name: string
  offset: number
  type: DebugType
}

/** A typed symbol: a name, where it lives, and its laid-out type. */
export interface DebugSymbol {
  name: string
  location: DebugLocation
  type: DebugType
}

/** The toolchain's typed-symbol model for a build. Globals now; scoped/frame
 *  symbols (phase 3, #131) extend this. */
export interface DebugInfo {
  symbols: DebugSymbol[]
}
