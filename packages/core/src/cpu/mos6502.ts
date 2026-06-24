// MOS 6502 opcode mnemonics — the bare instruction vocabulary. Keyed by
// MachinePlugin.cpu: 'mos6502' (Atari), 'ricoh-2a03' (NES 2A03), 'mos6510' (C64)
// all resolve here (identical mnemonics). The editor's StreamLanguage highlight
// and the label scanner read this to tell an opcode from a label, WITHOUT an LSP.
//
// The rich opcode hint data (descriptions, affected flags, addressing modes) is
// editor intelligence and lives in the assembly LSP (@madside/lsp-asm), loaded
// only in the language worker — keeping @core lean (the locked split, ADR-0009).

export interface CpuLanguage {
  /** Uppercase mnemonics the CPU understands. */
  opcodes: ReadonlySet<string>
}

export const MOS6502: CpuLanguage = {
  opcodes: new Set([
    'ADC', 'AND', 'ASL', 'BCC', 'BCS', 'BEQ', 'BIT', 'BMI', 'BNE', 'BPL', 'BRK',
    'BVC', 'BVS', 'CLC', 'CLD', 'CLI', 'CLV', 'CMP', 'CPX', 'CPY', 'DEC', 'DEX',
    'DEY', 'EOR', 'INC', 'INX', 'INY', 'JMP', 'JSR', 'LDA', 'LDX', 'LDY', 'LSR',
    'NOP', 'ORA', 'PHA', 'PHP', 'PLA', 'PLP', 'ROL', 'ROR', 'RTI', 'RTS', 'SBC',
    'SEC', 'SED', 'SEI', 'STA', 'STX', 'STY', 'TAX', 'TAY', 'TSX', 'TXA', 'TXS',
    'TYA',
  ]),
}
