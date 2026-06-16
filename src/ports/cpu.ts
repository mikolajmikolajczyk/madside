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
