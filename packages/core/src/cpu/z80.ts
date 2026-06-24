// Zilog Z80 opcode mnemonics — the bare instruction vocabulary. Keyed by
// MachinePlugin.cpu — 'z80' (ZX Spectrum + Z80 family). The editor's
// StreamLanguage highlight and the label scanner read this to tell an opcode from
// a label, WITHOUT an LSP. The rich hint data (descriptions, flags, operand
// forms) lives in the assembly LSP (@madside/lsp-asm), loaded only in the
// language worker — keeping @core lean (the locked split, ADR-0009).

import type { CpuLanguage } from './mos6502'

export const Z80: CpuLanguage = {
  opcodes: new Set([
    'ADC', 'ADD', 'AND', 'BIT', 'CALL', 'CCF', 'CP', 'CPD', 'CPDR', 'CPI', 'CPIR',
    'CPL', 'DAA', 'DEC', 'DI', 'DJNZ', 'EI', 'EX', 'EXX', 'HALT', 'IM', 'IN',
    'INC', 'IND', 'INDR', 'INI', 'INIR', 'JP', 'JR', 'LD', 'LDD', 'LDDR', 'LDI',
    'LDIR', 'NEG', 'NOP', 'OR', 'OTDR', 'OTIR', 'OUT', 'OUTD', 'OUTI', 'POP',
    'PUSH', 'RES', 'RET', 'RETI', 'RETN', 'RL', 'RLA', 'RLC', 'RLCA', 'RLD', 'RR',
    'RRA', 'RRC', 'RRCA', 'RRD', 'RST', 'SBC', 'SCF', 'SET', 'SLA', 'SRA', 'SRL',
    'SUB', 'XOR',
  ]),
}
