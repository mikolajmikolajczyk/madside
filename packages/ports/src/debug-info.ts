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

/** How to compute a stack frame's base address at runtime (#131, ADR-0012).
 *  Machine/ABI-specific but expressed generically so the panel stays neutral:
 *  - `memptr`: the frame base is a pointer held in memory — read a `bytes`-wide
 *    word at `addr` (cc65's software C-stack pointer `c_sp`, a zeropage word).
 *  - `reg`: the frame base is a CPU register (sccz80's IX frame pointer). */
export type DebugFrame =
  | { kind: 'memptr'; addr: number; bytes: number; endian: 'le' | 'be'; space?: string }
  | { kind: 'reg'; reg: string }

/** A local variable: its type + a **frame-relative** offset. Its live address is
 *  `frameBase + offset`, where `frameBase` comes from the owning scope's
 *  `DebugFrame`. (cc65: `local addr = read_word(c_sp) + offset`.) */
export interface DebugLocal {
  name: string
  offset: number
  type: DebugType
}

/** A lexical scope active over a PC range (a function, for now). Carries the
 *  frame model + the locals visible in it, so the panel can show "locals of the
 *  current frame": PC ∈ [pc.start, pc.end) → read the frame base → each local at
 *  base + offset. Language/machine-neutral (cc65 C today; sccz80 via `reg`). */
export interface DebugScope {
  /** Source-level name (the C function name, demangled). */
  name: string
  /** Half-open PC range this scope is active over. */
  pc: { start: number; end: number }
  frame: DebugFrame
  locals: DebugLocal[]
}

/** The toolchain's typed-symbol model for a build. `symbols` = globals; `scopes`
 *  = per-function frames + locals (phase 3, #131) — absent when the toolchain
 *  has no frame info (asm builds, z88dk today). */
export interface DebugInfo {
  symbols: DebugSymbol[]
  scopes?: DebugScope[]
}
