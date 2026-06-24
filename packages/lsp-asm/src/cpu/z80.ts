// Zilog Z80 opcode hints — description + flags + operand forms. Migrated from
// @core/cpu (desc/flags) and enriched with representative operand forms (the Z80
// has no 6502-style fixed addressing modes; it has many register/immediate/
// indirect operand combinations, so `modes` here lists the common forms a
// mnemonic accepts rather than an exhaustive cycle-accurate table). Flags use the
// Z80 set: S Z H P/V N C. Serves 'z80' (ZX Spectrum and the Z80 family).

import { cpuOpcodes, type OpcodeInfo, type OpcodeMode } from './types'

const f = (mode: string, syntax: string): OpcodeMode => ({ mode, syntax })
// Common operand-form bundles reused across the ALU group (ADD/ADC/SUB/SBC/AND/
// OR/XOR/CP all take A with r / n / (HL) / (IX+d)).
const ALU8 = [f('register', 'A,r'), f('immediate', 'A,n'), f('register indirect', 'A,(HL)'), f('indexed', 'A,(IX+d)')]
const BITOP = [f('register', 'b,r'), f('register indirect', 'b,(HL)'), f('indexed', 'b,(IX+d)')]
const SHIFT = [f('register', 'r'), f('register indirect', '(HL)'), f('indexed', '(IX+d)')]
const none: OpcodeMode[] = []

const INFO: Record<string, OpcodeInfo> = {
  ADC: { desc: 'Add with carry', flags: 'S Z H P/V N C', modes: [...ALU8, f('16-bit', 'HL,ss')] },
  ADD: { desc: 'Add', flags: 'S Z H P/V N C', modes: [...ALU8, f('16-bit', 'HL,ss'), f('indexed 16-bit', 'IX,pp')] },
  AND: { desc: 'Logical AND with A', flags: 'S Z H P/V N C', modes: ALU8 },
  BIT: { desc: 'Test bit b of operand', flags: 'S Z H P/V N', modes: BITOP },
  CALL: { desc: 'Call subroutine (push PC)', flags: '', modes: [f('direct', 'nn'), f('conditional', 'cc,nn')] },
  CCF: { desc: 'Complement carry flag', flags: 'H N C', modes: none },
  CP: { desc: 'Compare with A', flags: 'S Z H P/V N C', modes: ALU8 },
  CPD: { desc: 'Compare A with (HL), decrement HL/BC', flags: 'S Z H P/V N', modes: none },
  CPDR: { desc: 'Compare and decrement, repeat', flags: 'S Z H P/V N', modes: none },
  CPI: { desc: 'Compare A with (HL), increment HL, decrement BC', flags: 'S Z H P/V N', modes: none },
  CPIR: { desc: 'Compare and increment, repeat', flags: 'S Z H P/V N', modes: none },
  CPL: { desc: "Complement A (one's complement)", flags: 'H N', modes: none },
  DAA: { desc: 'Decimal adjust A after add/sub', flags: 'S Z H P/V C', modes: none },
  DEC: { desc: 'Decrement (8-bit; 16-bit form sets no flags)', flags: 'S Z H P/V N', modes: [f('register', 'r'), f('register indirect', '(HL)'), f('16-bit', 'ss')] },
  DI: { desc: 'Disable maskable interrupts', flags: '', modes: none },
  DJNZ: { desc: 'Decrement B, jump relative if not zero', flags: '', modes: [f('relative', 'e')] },
  EI: { desc: 'Enable maskable interrupts', flags: '', modes: none },
  EX: { desc: 'Exchange register pair', flags: '', modes: [f('register', 'DE,HL'), f('stack', '(SP),HL'), f('alternate', "AF,AF'")] },
  EXX: { desc: 'Exchange BC/DE/HL with the alternate set', flags: '', modes: none },
  HALT: { desc: 'Halt CPU until interrupt', flags: '', modes: none },
  IM: { desc: 'Set interrupt mode (0/1/2)', flags: '', modes: [f('mode', '0|1|2')] },
  IN: { desc: 'Input from port', flags: 'S Z H P/V N', modes: [f('register', 'A,(n)'), f('register indirect', 'r,(C)')] },
  INC: { desc: 'Increment (8-bit; 16-bit form sets no flags)', flags: 'S Z H P/V N', modes: [f('register', 'r'), f('register indirect', '(HL)'), f('16-bit', 'ss')] },
  IND: { desc: 'Input to (HL), decrement HL/B', flags: 'S Z H P/V N', modes: none },
  INDR: { desc: 'Input and decrement, repeat', flags: 'S Z H P/V N', modes: none },
  INI: { desc: 'Input to (HL), increment HL, decrement B', flags: 'S Z H P/V N', modes: none },
  INIR: { desc: 'Input and increment, repeat', flags: 'S Z H P/V N', modes: none },
  JP: { desc: 'Unconditional/conditional jump', flags: '', modes: [f('direct', 'nn'), f('conditional', 'cc,nn'), f('register indirect', '(HL)')] },
  JR: { desc: 'Relative jump', flags: '', modes: [f('relative', 'e'), f('conditional', 'cc,e')] },
  LD: { desc: 'Load (LD A,I / LD A,R also set S Z H P/V N)', flags: '', modes: [f('register', 'r,r'), f('immediate', 'r,n'), f('register indirect', 'r,(HL)'), f('16-bit immediate', 'dd,nn'), f('direct', 'A,(nn)'), f('indexed', 'r,(IX+d)')] },
  LDD: { desc: 'Load (DE)←(HL), decrement HL/DE/BC', flags: 'H P/V N', modes: none },
  LDDR: { desc: 'Load and decrement, repeat (block copy down)', flags: 'H P/V N', modes: none },
  LDI: { desc: 'Load (DE)←(HL), increment HL/DE, decrement BC', flags: 'H P/V N', modes: none },
  LDIR: { desc: 'Load and increment, repeat (block copy up)', flags: 'H P/V N', modes: none },
  NEG: { desc: "Negate A (two's complement)", flags: 'S Z H P/V N C', modes: none },
  NOP: { desc: 'No operation', flags: '', modes: none },
  OR: { desc: 'Logical OR with A', flags: 'S Z H P/V N C', modes: ALU8 },
  OTDR: { desc: 'Output and decrement, repeat', flags: 'S Z H P/V N', modes: none },
  OTIR: { desc: 'Output and increment, repeat', flags: 'S Z H P/V N', modes: none },
  OUT: { desc: 'Output to port', flags: '', modes: [f('direct', '(n),A'), f('register indirect', '(C),r')] },
  OUTD: { desc: 'Output (HL)→port, decrement HL/B', flags: 'S Z H P/V N', modes: none },
  OUTI: { desc: 'Output (HL)→port, increment HL, decrement B', flags: 'S Z H P/V N', modes: none },
  POP: { desc: 'Pop register pair from stack', flags: '', modes: [f('register pair', 'qq')] },
  PUSH: { desc: 'Push register pair onto stack', flags: '', modes: [f('register pair', 'qq')] },
  RES: { desc: 'Reset bit b of operand', flags: '', modes: BITOP },
  RET: { desc: 'Return from subroutine', flags: '', modes: [f('unconditional', ''), f('conditional', 'cc')] },
  RETI: { desc: 'Return from interrupt', flags: '', modes: none },
  RETN: { desc: 'Return from non-maskable interrupt', flags: '', modes: none },
  RL: { desc: 'Rotate left through carry', flags: 'S Z H P/V N C', modes: SHIFT },
  RLA: { desc: 'Rotate A left through carry', flags: 'H N C', modes: none },
  RLC: { desc: 'Rotate left circular', flags: 'S Z H P/V N C', modes: SHIFT },
  RLCA: { desc: 'Rotate A left circular', flags: 'H N C', modes: none },
  RLD: { desc: 'Rotate left nibble between A and (HL)', flags: 'S Z H P/V N', modes: none },
  RR: { desc: 'Rotate right through carry', flags: 'S Z H P/V N C', modes: SHIFT },
  RRA: { desc: 'Rotate A right through carry', flags: 'H N C', modes: none },
  RRC: { desc: 'Rotate right circular', flags: 'S Z H P/V N C', modes: SHIFT },
  RRCA: { desc: 'Rotate A right circular', flags: 'H N C', modes: none },
  RRD: { desc: 'Rotate right nibble between A and (HL)', flags: 'S Z H P/V N', modes: none },
  RST: { desc: 'Restart (call fixed page-zero address)', flags: '', modes: [f('vector', 'p')] },
  SBC: { desc: 'Subtract with carry', flags: 'S Z H P/V N C', modes: [...ALU8, f('16-bit', 'HL,ss')] },
  SCF: { desc: 'Set carry flag', flags: 'H N C', modes: none },
  SET: { desc: 'Set bit b of operand', flags: '', modes: BITOP },
  SLA: { desc: 'Shift left arithmetic', flags: 'S Z H P/V N C', modes: SHIFT },
  SRA: { desc: 'Shift right arithmetic (preserve sign)', flags: 'S Z H P/V N C', modes: SHIFT },
  SRL: { desc: 'Shift right logical', flags: 'S Z H P/V N C', modes: SHIFT },
  SUB: { desc: 'Subtract from A', flags: 'S Z H P/V N C', modes: ALU8 },
  XOR: { desc: 'Logical XOR with A', flags: 'S Z H P/V N C', modes: ALU8 },
}

export const Z80 = cpuOpcodes(INFO)
