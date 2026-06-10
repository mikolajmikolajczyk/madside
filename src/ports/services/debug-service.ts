// DebugService — generic step / BP / register / memory surface. M6 generalises
// into DebugAdapter plugin per machine; today this wraps the Atari emulator
// directly via the existing EmuBackend.

export interface RegState {
  // 6502-shape today. M6 widens to Record<string, number> so non-6502 machines
  // can declare their own register set.
  a: number
  x: number
  y: number
  pc: number
  sp: number
}

export interface FlagState {
  n: boolean
  v: boolean
  b: boolean
  d: boolean
  i: boolean
  z: boolean
  c: boolean
}

export interface DebugService {
  step(): Promise<void>
  stepFrame(): Promise<void>
  setBreakpoint(addr: number): void
  clearBreakpoint(addr: number): void
  breakpoints(): ReadonlySet<number>

  registers(): Promise<RegState>
  flags(): Promise<FlagState>
  readMemory(addr: number, len: number): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>
}
