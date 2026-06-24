// CPU opcode-hint tables, resolved by MachinePlugin.cpu id. The LSP engine reads
// these for hover (desc + flags + addressing modes), completion, and
// addressing-mode diagnostics. @core/cpu keeps only the bare mnemonic SET that
// non-LSP code (label scanning, StreamLanguage highlighting) needs; the rich
// hint data lives here, loaded only in the language worker.

import { MOS6502 } from './mos6502'
import { Z80 } from './z80'
import type { CpuOpcodes } from './types'

export type { CpuOpcodes, OpcodeInfo, OpcodeMode } from './types'
export { MOS6502 } from './mos6502'
export { Z80 } from './z80'

const REGISTRY: Record<string, CpuOpcodes> = {
  'mos6502': MOS6502, // Atari 8-bit
  'ricoh-2a03': MOS6502, // NES 2A03 = 6502 with decimal mode disabled
  'mos6510': MOS6502, // C64 6510 = 6502 + on-chip I/O port
  'z80': Z80, // ZX Spectrum + Z80 family
}

/** Resolve the opcode hint table for a CPU id, or undefined if unknown. */
export function getCpuOpcodes(cpuId: string): CpuOpcodes | undefined {
  return REGISTRY[cpuId]
}
