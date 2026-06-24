// Motorola 68000 opcode hints — description + flags + representative operand
// forms. The 68000 has rich effective-addressing operand forms (Dn, An, (An),
// (An)+, -(An), d(An), d(An,Xn), abs, d(PC), #imm) and size suffixes (.b/.w/.l),
// so `modes` here lists common forms rather than an exhaustive table (like z80).
// Flags use the 68000 CCR: X (extend) N (negative) Z (zero) V (overflow) C
// (carry). Serves 'm68000' (Sega Genesis / Mega Drive).

import { cpuOpcodes, type OpcodeInfo, type OpcodeMode } from './types'

const f = (mode: string, syntax: string): OpcodeMode => ({ mode, syntax })
const ALU = [f('ea→Dn', 'ea,Dn'), f('Dn→ea', 'Dn,ea')]
const IMM = [f('immediate', '#imm,ea')]
const SHIFT = [f('register', 'Dx,Dy'), f('immediate', '#imm,Dy'), f('memory', 'ea')]
const ALLF = 'X N Z V C'
const LOGF = 'N Z' // logic/move clear V,C

const INFO: Record<string, OpcodeInfo> = {
  ABCD: { desc: 'Add decimal with extend', flags: ALLF, modes: [f('register', 'Dy,Dx'), f('memory', '-(Ay),-(Ax)')] },
  ADD: { desc: 'Add', flags: ALLF, modes: ALU },
  ADDA: { desc: 'Add address (to An, no flags)', flags: '', modes: [f('to address reg', 'ea,An')] },
  ADDI: { desc: 'Add immediate', flags: ALLF, modes: IMM },
  ADDQ: { desc: 'Add quick (1-8)', flags: ALLF, modes: [f('quick', '#1-8,ea')] },
  ADDX: { desc: 'Add with extend', flags: ALLF, modes: [f('register', 'Dy,Dx'), f('memory', '-(Ay),-(Ax)')] },
  AND: { desc: 'Logical AND', flags: LOGF, modes: ALU },
  ANDI: { desc: 'AND immediate (also to CCR/SR)', flags: LOGF, modes: [...IMM, f('to CCR', '#imm,CCR')] },
  ASL: { desc: 'Arithmetic shift left', flags: ALLF, modes: SHIFT },
  ASR: { desc: 'Arithmetic shift right', flags: ALLF, modes: SHIFT },
  BCHG: { desc: 'Test bit and change', flags: 'Z', modes: [f('register', 'Dn,ea'), f('immediate', '#bit,ea')] },
  BCLR: { desc: 'Test bit and clear', flags: 'Z', modes: [f('register', 'Dn,ea'), f('immediate', '#bit,ea')] },
  BSET: { desc: 'Test bit and set', flags: 'Z', modes: [f('register', 'Dn,ea'), f('immediate', '#bit,ea')] },
  BTST: { desc: 'Test bit', flags: 'Z', modes: [f('register', 'Dn,ea'), f('immediate', '#bit,ea')] },
  CHK: { desc: 'Check register against bounds', flags: 'N', modes: [f('check', 'ea,Dn')] },
  CLR: { desc: 'Clear operand', flags: LOGF, modes: [f('clear', 'ea')] },
  CMP: { desc: 'Compare', flags: ALLF, modes: [f('compare', 'ea,Dn')] },
  CMPA: { desc: 'Compare address', flags: ALLF, modes: [f('compare', 'ea,An')] },
  CMPI: { desc: 'Compare immediate', flags: ALLF, modes: [f('immediate', '#imm,ea')] },
  CMPM: { desc: 'Compare memory', flags: ALLF, modes: [f('postincrement', '(Ay)+,(Ax)+')] },
  DIVS: { desc: 'Signed divide (32/16)', flags: 'N Z V', modes: [f('divide', 'ea,Dn')] },
  DIVU: { desc: 'Unsigned divide (32/16)', flags: 'N Z V', modes: [f('divide', 'ea,Dn')] },
  EOR: { desc: 'Logical exclusive OR', flags: LOGF, modes: [f('Dn→ea', 'Dn,ea')] },
  EORI: { desc: 'EOR immediate (also to CCR/SR)', flags: LOGF, modes: [...IMM, f('to CCR', '#imm,CCR')] },
  EXG: { desc: 'Exchange registers', flags: '', modes: [f('exchange', 'Rx,Ry')] },
  EXT: { desc: 'Sign-extend', flags: LOGF, modes: [f('extend', 'Dn')] },
  ILLEGAL: { desc: 'Illegal instruction trap', flags: '', modes: [] },
  JMP: { desc: 'Jump', flags: '', modes: [f('jump', 'ea')] },
  JSR: { desc: 'Jump to subroutine', flags: '', modes: [f('call', 'ea')] },
  LEA: { desc: 'Load effective address', flags: '', modes: [f('load', 'ea,An')] },
  LINK: { desc: 'Link and allocate stack frame', flags: '', modes: [f('link', 'An,#disp')] },
  LSL: { desc: 'Logical shift left', flags: ALLF, modes: SHIFT },
  LSR: { desc: 'Logical shift right', flags: ALLF, modes: SHIFT },
  MOVE: { desc: 'Move data (also to/from CCR/SR/USP)', flags: LOGF, modes: [f('move', 'ea,ea'), f('to CCR', 'ea,CCR')] },
  MOVEA: { desc: 'Move to address register (no flags)', flags: '', modes: [f('move', 'ea,An')] },
  MOVEM: { desc: 'Move multiple registers', flags: '', modes: [f('store', 'list,-(An)'), f('load', '(An)+,list')] },
  MOVEP: { desc: 'Move peripheral data', flags: '', modes: [f('move', 'Dn,d(An)')] },
  MOVEQ: { desc: 'Move quick (sign-extended byte)', flags: LOGF, modes: [f('quick', '#imm,Dn')] },
  MULS: { desc: 'Signed multiply (16×16→32)', flags: LOGF, modes: [f('multiply', 'ea,Dn')] },
  MULU: { desc: 'Unsigned multiply (16×16→32)', flags: LOGF, modes: [f('multiply', 'ea,Dn')] },
  NBCD: { desc: 'Negate decimal with extend', flags: ALLF, modes: [f('negate', 'ea')] },
  NEG: { desc: 'Negate', flags: ALLF, modes: [f('negate', 'ea')] },
  NEGX: { desc: 'Negate with extend', flags: ALLF, modes: [f('negate', 'ea')] },
  NOP: { desc: 'No operation', flags: '', modes: [] },
  NOT: { desc: "Logical complement (one's)", flags: LOGF, modes: [f('complement', 'ea')] },
  OR: { desc: 'Logical inclusive OR', flags: LOGF, modes: ALU },
  ORI: { desc: 'OR immediate (also to CCR/SR)', flags: LOGF, modes: [...IMM, f('to CCR', '#imm,CCR')] },
  PEA: { desc: 'Push effective address', flags: '', modes: [f('push', 'ea')] },
  RESET: { desc: 'Reset external devices', flags: '', modes: [] },
  ROL: { desc: 'Rotate left', flags: 'N Z V C', modes: SHIFT },
  ROR: { desc: 'Rotate right', flags: 'N Z V C', modes: SHIFT },
  ROXL: { desc: 'Rotate left with extend', flags: ALLF, modes: SHIFT },
  ROXR: { desc: 'Rotate right with extend', flags: ALLF, modes: SHIFT },
  RTE: { desc: 'Return from exception', flags: 'all', modes: [] },
  RTR: { desc: 'Return and restore CCR', flags: 'all', modes: [] },
  RTS: { desc: 'Return from subroutine', flags: '', modes: [] },
  SBCD: { desc: 'Subtract decimal with extend', flags: ALLF, modes: [f('register', 'Dy,Dx'), f('memory', '-(Ay),-(Ax)')] },
  STOP: { desc: 'Load SR and stop', flags: 'all', modes: [f('stop', '#imm')] },
  SUB: { desc: 'Subtract', flags: ALLF, modes: ALU },
  SUBA: { desc: 'Subtract address (no flags)', flags: '', modes: [f('from address reg', 'ea,An')] },
  SUBI: { desc: 'Subtract immediate', flags: ALLF, modes: IMM },
  SUBQ: { desc: 'Subtract quick (1-8)', flags: ALLF, modes: [f('quick', '#1-8,ea')] },
  SUBX: { desc: 'Subtract with extend', flags: ALLF, modes: [f('register', 'Dy,Dx'), f('memory', '-(Ay),-(Ax)')] },
  SWAP: { desc: 'Swap register halves', flags: LOGF, modes: [f('swap', 'Dn')] },
  TAS: { desc: 'Test and set (atomic)', flags: LOGF, modes: [f('test', 'ea')] },
  TRAP: { desc: 'Trap (software interrupt 0-15)', flags: '', modes: [f('trap', '#vector')] },
  TRAPV: { desc: 'Trap on overflow', flags: '', modes: [] },
  TST: { desc: 'Test operand (set N/Z)', flags: LOGF, modes: [f('test', 'ea')] },
  UNLK: { desc: 'Unlink stack frame', flags: '', modes: [f('unlink', 'An')] },
  BRA: { desc: 'Branch always', flags: '', modes: [f('branch', 'label')] },
  BSR: { desc: 'Branch to subroutine', flags: '', modes: [f('call', 'label')] },
  DBRA: { desc: 'Decrement and branch (until -1)', flags: '', modes: [f('loop', 'Dn,label')] },
  DBT: { desc: 'Decrement and branch if true (never loops)', flags: '', modes: [f('loop', 'Dn,label')] },
  DBF: { desc: 'Decrement and branch if false (= DBRA)', flags: '', modes: [f('loop', 'Dn,label')] },
  ST: { desc: 'Set if true (always $FF)', flags: '', modes: [f('set', 'ea')] },
  SF: { desc: 'Set if false (always $00)', flags: '', modes: [f('set', 'ea')] },
}

// Condition codes → human name, used to generate the Bcc / DBcc / Scc families.
const CC: Record<string, string> = {
  HI: 'higher', LS: 'lower or same', CC: 'carry clear', CS: 'carry set',
  NE: 'not equal', EQ: 'equal', VC: 'overflow clear', VS: 'overflow set',
  PL: 'plus', MI: 'minus', GE: 'greater or equal', LT: 'less than',
  GT: 'greater than', LE: 'less or equal',
}
for (const [cc, name] of Object.entries(CC)) {
  INFO[`B${cc}`] = { desc: `Branch if ${name}`, flags: '', modes: [{ mode: 'branch', syntax: 'label' }] }
  INFO[`DB${cc}`] = { desc: `Decrement and branch while not ${name}`, flags: '', modes: [{ mode: 'loop', syntax: 'Dn,label' }] }
  INFO[`S${cc}`] = { desc: `Set byte to $FF if ${name}, else $00`, flags: '', modes: [{ mode: 'set', syntax: 'ea' }] }
}

export const M68000 = cpuOpcodes(INFO)
