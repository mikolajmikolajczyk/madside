// Motorola 68000 opcode mnemonics — the bare instruction vocabulary (size
// suffixes like .b/.w/.l are NOT part of the mnemonic; the editor strips them
// before lookup). Keyed by MachinePlugin.cpu — 'm68000' (Sega Genesis / Mega
// Drive). Read by the StreamLanguage highlight + label scanner WITHOUT an LSP.
// Rich hint data (descriptions, flags, operand forms) lives in the assembly LSP
// (@madside/lsp-asm), loaded only in the language worker (the locked split).

import type { CpuLanguage } from './mos6502'

export const M68000: CpuLanguage = {
  opcodes: new Set([
    // data movement / arithmetic / logic
    'ABCD', 'ADD', 'ADDA', 'ADDI', 'ADDQ', 'ADDX', 'AND', 'ANDI', 'ASL', 'ASR',
    'BCHG', 'BCLR', 'BSET', 'BTST', 'CHK', 'CLR', 'CMP', 'CMPA', 'CMPI', 'CMPM',
    'DIVS', 'DIVU', 'EOR', 'EORI', 'EXG', 'EXT', 'ILLEGAL', 'JMP', 'JSR', 'LEA',
    'LINK', 'LSL', 'LSR', 'MOVE', 'MOVEA', 'MOVEM', 'MOVEP', 'MOVEQ', 'MULS',
    'MULU', 'NBCD', 'NEG', 'NEGX', 'NOP', 'NOT', 'OR', 'ORI', 'PEA', 'RESET',
    'ROL', 'ROR', 'ROXL', 'ROXR', 'RTE', 'RTR', 'RTS', 'SBCD', 'STOP', 'SUB',
    'SUBA', 'SUBI', 'SUBQ', 'SUBX', 'SWAP', 'TAS', 'TRAP', 'TRAPV', 'TST', 'UNLK',
    // branches (Bcc)
    'BRA', 'BSR', 'BHI', 'BLS', 'BCC', 'BCS', 'BNE', 'BEQ', 'BVC', 'BVS', 'BPL',
    'BMI', 'BGE', 'BLT', 'BGT', 'BLE',
    // decrement-and-branch (DBcc)
    'DBRA', 'DBT', 'DBF', 'DBHI', 'DBLS', 'DBCC', 'DBCS', 'DBNE', 'DBEQ', 'DBVC',
    'DBVS', 'DBPL', 'DBMI', 'DBGE', 'DBLT', 'DBGT', 'DBLE',
    // set-conditionally (Scc)
    'ST', 'SF', 'SHI', 'SLS', 'SCC', 'SCS', 'SNE', 'SEQ', 'SVC', 'SVS', 'SPL',
    'SMI', 'SGE', 'SLT', 'SGT', 'SLE',
  ]),
}
