// Shared CPU register snapshots. `RunBackend.cpuState()` stays `unknown` (it is
// machine-agnostic), but the 6502 family backends (Altirra, jsnes) all produce
// this shape and the 6502 DebugAdapter consumes it — one type instead of three
// identical interfaces kept in sync by a comment.

export interface Cpu6502State {
  a: number
  x: number
  y: number
  pc: number
  sp: number
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean }
}

// Z80 register snapshot — produced by the chips ZX backend, consumed by the
// Z80 DebugAdapter + register panel (#85). 16-bit register pairs (the panel
// can split a pair into its hi/lo halves), the IX/IY index registers, the
// I/R interrupt+refresh pair, the alternate (shadow) bank, and the Z80 flag
// set (S Z H P/V N C) decoded from F.
export interface CpuZ80State {
  pc: number
  sp: number
  af: number
  bc: number
  de: number
  hl: number
  ix: number
  iy: number
  ir: number
  // Shadow bank (AF'/BC'/DE'/HL').
  af2: number
  bc2: number
  de2: number
  hl2: number
  im: number
  iff1: boolean
  iff2: boolean
  // Decoded from F (bit7..bit0: S Z - H - P/V N C).
  flags: { s: boolean; z: boolean; h: boolean; pv: boolean; n: boolean; c: boolean }
}

// Motorola 68000 register snapshot — produced by the Genesis (gpgx) backend,
// consumed by the m68k DebugAdapter + register panel (#145). Eight 32-bit data
// (D0–D7) + eight 32-bit address (A0–A7, A7 = SP) registers, a 32-bit PC (24-bit
// bus), and the 16-bit status register. The condition-code flags (X N Z V C) are
// decoded from SR by the adapter, so they aren't duplicated here.
export interface Cpu68kState {
  d: number[]
  a: number[]
  pc: number
  sr: number
}
