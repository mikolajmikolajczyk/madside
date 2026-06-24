// MOS 6502 opcode hints — description + flags + addressing modes. Migrated from
// @core/cpu (desc/flags) and enriched with addressing modes (the "in which mode"
// the editor can now show on hover/completion + validate on the operand line).
// Serves 'mos6502' (Atari), 'ricoh-2a03' (NES 2A03), 'mos6510' (C64) — the
// official 6502 instruction set; the 2A03 only disables decimal mode.

import { cpuOpcodes, type OpcodeInfo, type OpcodeMode } from './types'

// 6502 addressing modes as reusable templates (syntax + encoded byte length), so
// each opcode lists the modes it accepts without repeating syntax/size.
const M = {
  imp: { mode: 'implied', syntax: '', bytes: 1 },
  acc: { mode: 'accumulator', syntax: 'A', bytes: 1 },
  imm: { mode: 'immediate', syntax: '#$nn', bytes: 2 },
  zp: { mode: 'zeropage', syntax: '$nn', bytes: 2 },
  zpx: { mode: 'zeropage,X', syntax: '$nn,X', bytes: 2 },
  zpy: { mode: 'zeropage,Y', syntax: '$nn,Y', bytes: 2 },
  abs: { mode: 'absolute', syntax: '$nnnn', bytes: 3 },
  abx: { mode: 'absolute,X', syntax: '$nnnn,X', bytes: 3 },
  aby: { mode: 'absolute,Y', syntax: '$nnnn,Y', bytes: 3 },
  ind: { mode: 'indirect', syntax: '($nnnn)', bytes: 3 },
  izx: { mode: '(indirect,X)', syntax: '($nn,X)', bytes: 2 },
  izy: { mode: '(indirect),Y', syntax: '($nn),Y', bytes: 2 },
  rel: { mode: 'relative', syntax: '$rr', bytes: 2 },
} as const satisfies Record<string, OpcodeMode>

type ModeKey = keyof typeof M
const m = (...keys: ModeKey[]): OpcodeMode[] => keys.map((k) => M[k])

// All branch instructions share relative; the load/store/ALU ops share the
// memory-addressing families.
const ALU = m('imm', 'zp', 'zpx', 'abs', 'abx', 'aby', 'izx', 'izy') // ADC/AND/CMP/EOR/LDA/ORA/SBC/STA*
const RMW = m('acc', 'zp', 'zpx', 'abs', 'abx') // ASL/LSR/ROL/ROR
const BR = m('rel')

const INFO: Record<string, OpcodeInfo> = {
  ADC: { desc: 'Add memory to A with carry', flags: 'N V Z C', modes: ALU },
  AND: { desc: 'Bitwise AND with A', flags: 'N Z', modes: ALU },
  ASL: { desc: 'Arithmetic shift left', flags: 'N Z C', modes: RMW },
  BCC: { desc: 'Branch if carry clear', flags: '', modes: BR },
  BCS: { desc: 'Branch if carry set', flags: '', modes: BR },
  BEQ: { desc: 'Branch if equal (Z set)', flags: '', modes: BR },
  BIT: { desc: 'Test bits in A vs memory', flags: 'N V Z', modes: m('zp', 'abs') },
  BMI: { desc: 'Branch if minus (N set)', flags: '', modes: BR },
  BNE: { desc: 'Branch if not equal (Z clear)', flags: '', modes: BR },
  BPL: { desc: 'Branch if plus (N clear)', flags: '', modes: BR },
  BRK: { desc: 'Force interrupt', flags: 'B I', modes: m('imp') },
  BVC: { desc: 'Branch if overflow clear', flags: '', modes: BR },
  BVS: { desc: 'Branch if overflow set', flags: '', modes: BR },
  CLC: { desc: 'Clear carry flag', flags: 'C', modes: m('imp') },
  CLD: { desc: 'Clear decimal mode', flags: 'D', modes: m('imp') },
  CLI: { desc: 'Clear interrupt disable', flags: 'I', modes: m('imp') },
  CLV: { desc: 'Clear overflow flag', flags: 'V', modes: m('imp') },
  CMP: { desc: 'Compare A with memory', flags: 'N Z C', modes: ALU },
  CPX: { desc: 'Compare X with memory', flags: 'N Z C', modes: m('imm', 'zp', 'abs') },
  CPY: { desc: 'Compare Y with memory', flags: 'N Z C', modes: m('imm', 'zp', 'abs') },
  DEC: { desc: 'Decrement memory', flags: 'N Z', modes: m('zp', 'zpx', 'abs', 'abx') },
  DEX: { desc: 'Decrement X', flags: 'N Z', modes: m('imp') },
  DEY: { desc: 'Decrement Y', flags: 'N Z', modes: m('imp') },
  EOR: { desc: 'Bitwise XOR with A', flags: 'N Z', modes: ALU },
  INC: { desc: 'Increment memory', flags: 'N Z', modes: m('zp', 'zpx', 'abs', 'abx') },
  INX: { desc: 'Increment X', flags: 'N Z', modes: m('imp') },
  INY: { desc: 'Increment Y', flags: 'N Z', modes: m('imp') },
  JMP: { desc: 'Unconditional jump', flags: '', modes: m('abs', 'ind') },
  JSR: { desc: 'Jump to subroutine (push PC)', flags: '', modes: m('abs') },
  LDA: { desc: 'Load A from memory', flags: 'N Z', modes: ALU },
  LDX: { desc: 'Load X from memory', flags: 'N Z', modes: m('imm', 'zp', 'zpy', 'abs', 'aby') },
  LDY: { desc: 'Load Y from memory', flags: 'N Z', modes: m('imm', 'zp', 'zpx', 'abs', 'abx') },
  LSR: { desc: 'Logical shift right', flags: 'N Z C', modes: RMW },
  NOP: { desc: 'No operation', flags: '', modes: m('imp') },
  ORA: { desc: 'Bitwise OR with A', flags: 'N Z', modes: ALU },
  PHA: { desc: 'Push A onto stack', flags: '', modes: m('imp') },
  PHP: { desc: 'Push processor status', flags: '', modes: m('imp') },
  PLA: { desc: 'Pull A from stack', flags: 'N Z', modes: m('imp') },
  PLP: { desc: 'Pull processor status', flags: 'all', modes: m('imp') },
  ROL: { desc: 'Rotate left through carry', flags: 'N Z C', modes: RMW },
  ROR: { desc: 'Rotate right through carry', flags: 'N Z C', modes: RMW },
  RTI: { desc: 'Return from interrupt', flags: 'all', modes: m('imp') },
  RTS: { desc: 'Return from subroutine', flags: '', modes: m('imp') },
  SBC: { desc: 'Subtract memory from A with borrow', flags: 'N V Z C', modes: ALU },
  SEC: { desc: 'Set carry flag', flags: 'C', modes: m('imp') },
  SED: { desc: 'Set decimal mode', flags: 'D', modes: m('imp') },
  SEI: { desc: 'Set interrupt disable', flags: 'I', modes: m('imp') },
  STA: { desc: 'Store A to memory', flags: '', modes: m('zp', 'zpx', 'abs', 'abx', 'aby', 'izx', 'izy') },
  STX: { desc: 'Store X to memory', flags: '', modes: m('zp', 'zpy', 'abs') },
  STY: { desc: 'Store Y to memory', flags: '', modes: m('zp', 'zpx', 'abs') },
  TAX: { desc: 'Transfer A to X', flags: 'N Z', modes: m('imp') },
  TAY: { desc: 'Transfer A to Y', flags: 'N Z', modes: m('imp') },
  TSX: { desc: 'Transfer stack pointer to X', flags: 'N Z', modes: m('imp') },
  TXA: { desc: 'Transfer X to A', flags: 'N Z', modes: m('imp') },
  TXS: { desc: 'Transfer X to stack pointer', flags: '', modes: m('imp') },
  TYA: { desc: 'Transfer Y to A', flags: 'N Z', modes: m('imp') },
}

export const MOS6502 = cpuOpcodes(INFO)
