// Zilog Z80 instruction vocabulary — opcode mnemonics + hover docs. CPU-level
// (not toolchain-level): every Z80 assembler shares this set. Keyed by
// MachinePlugin.cpu — 'z80' (ZX Spectrum) resolves here. The Z80 is a
// different ISA from the 6502: new mnemonics, new flag set (S Z H P/V N C),
// 16-bit ops, block transfer/search, bit ops, and exchange/alt-register
// instructions. Lives in @core so both @ui (editor language) and @app (label
// scanner) can read it without crossing layers (ADR-0002).

import type { CpuLanguage, OpcodeDoc } from "./mos6502";

// Docs are the single source of truth; the opcode set is derived from the keys
// below so the two can never drift. Flags use the Z80 status set:
// S (sign) Z (zero) H (half-carry) P/V (parity/overflow) N (subtract) C (carry).
const DOCS: Record<string, OpcodeDoc> = {
  ADC: { desc: "Add with carry", flags: "S Z H P/V N C" },
  ADD: { desc: "Add", flags: "S Z H P/V N C" },
  AND: { desc: "Logical AND with A", flags: "S Z H P/V N C" },
  BIT: { desc: "Test bit b of operand", flags: "S Z H P/V N" },
  CALL: { desc: "Call subroutine (push PC)", flags: "" },
  CCF: { desc: "Complement carry flag", flags: "H N C" },
  CP: { desc: "Compare with A", flags: "S Z H P/V N C" },
  CPD: { desc: "Compare A with (HL), decrement HL/BC", flags: "S Z H P/V N" },
  CPDR: { desc: "Compare and decrement, repeat", flags: "S Z H P/V N" },
  CPI: { desc: "Compare A with (HL), increment HL, decrement BC", flags: "S Z H P/V N" },
  CPIR: { desc: "Compare and increment, repeat", flags: "S Z H P/V N" },
  CPL: { desc: "Complement A (one's complement)", flags: "H N" },
  DAA: { desc: "Decimal adjust A after add/sub", flags: "S Z H P/V C" },
  DEC: { desc: "Decrement (8-bit; 16-bit form sets no flags)", flags: "S Z H P/V N" },
  DI: { desc: "Disable maskable interrupts", flags: "" },
  DJNZ: { desc: "Decrement B, jump relative if not zero", flags: "" },
  EI: { desc: "Enable maskable interrupts", flags: "" },
  EX: { desc: "Exchange register pair", flags: "" },
  EXX: { desc: "Exchange BC/DE/HL with the alternate set", flags: "" },
  HALT: { desc: "Halt CPU until interrupt", flags: "" },
  IM: { desc: "Set interrupt mode (0/1/2)", flags: "" },
  IN: { desc: "Input from port", flags: "S Z H P/V N" },
  INC: { desc: "Increment (8-bit; 16-bit form sets no flags)", flags: "S Z H P/V N" },
  IND: { desc: "Input to (HL), decrement HL/B", flags: "S Z H P/V N" },
  INDR: { desc: "Input and decrement, repeat", flags: "S Z H P/V N" },
  INI: { desc: "Input to (HL), increment HL, decrement B", flags: "S Z H P/V N" },
  INIR: { desc: "Input and increment, repeat", flags: "S Z H P/V N" },
  JP: { desc: "Unconditional/conditional jump", flags: "" },
  JR: { desc: "Relative jump", flags: "" },
  LD: { desc: "Load (LD A,I / LD A,R also set S Z H P/V N)", flags: "" },
  LDD: { desc: "Load (DE)←(HL), decrement HL/DE/BC", flags: "H P/V N" },
  LDDR: { desc: "Load and decrement, repeat (block copy down)", flags: "H P/V N" },
  LDI: { desc: "Load (DE)←(HL), increment HL/DE, decrement BC", flags: "H P/V N" },
  LDIR: { desc: "Load and increment, repeat (block copy up)", flags: "H P/V N" },
  NEG: { desc: "Negate A (two's complement)", flags: "S Z H P/V N C" },
  NOP: { desc: "No operation", flags: "" },
  OR: { desc: "Logical OR with A", flags: "S Z H P/V N C" },
  OTDR: { desc: "Output and decrement, repeat", flags: "S Z H P/V N" },
  OTIR: { desc: "Output and increment, repeat", flags: "S Z H P/V N" },
  OUT: { desc: "Output to port", flags: "" },
  OUTD: { desc: "Output (HL)→port, decrement HL/B", flags: "S Z H P/V N" },
  OUTI: { desc: "Output (HL)→port, increment HL, decrement B", flags: "S Z H P/V N" },
  POP: { desc: "Pop register pair from stack", flags: "" },
  PUSH: { desc: "Push register pair onto stack", flags: "" },
  RES: { desc: "Reset bit b of operand", flags: "" },
  RET: { desc: "Return from subroutine", flags: "" },
  RETI: { desc: "Return from interrupt", flags: "" },
  RETN: { desc: "Return from non-maskable interrupt", flags: "" },
  RL: { desc: "Rotate left through carry", flags: "S Z H P/V N C" },
  RLA: { desc: "Rotate A left through carry", flags: "H N C" },
  RLC: { desc: "Rotate left circular", flags: "S Z H P/V N C" },
  RLCA: { desc: "Rotate A left circular", flags: "H N C" },
  RLD: { desc: "Rotate left nibble between A and (HL)", flags: "S Z H P/V N" },
  RR: { desc: "Rotate right through carry", flags: "S Z H P/V N C" },
  RRA: { desc: "Rotate A right through carry", flags: "H N C" },
  RRC: { desc: "Rotate right circular", flags: "S Z H P/V N C" },
  RRCA: { desc: "Rotate A right circular", flags: "H N C" },
  RRD: { desc: "Rotate right nibble between A and (HL)", flags: "S Z H P/V N" },
  RST: { desc: "Restart (call fixed page-zero address)", flags: "" },
  SBC: { desc: "Subtract with carry", flags: "S Z H P/V N C" },
  SCF: { desc: "Set carry flag", flags: "H N C" },
  SET: { desc: "Set bit b of operand", flags: "" },
  SLA: { desc: "Shift left arithmetic", flags: "S Z H P/V N C" },
  SRA: { desc: "Shift right arithmetic (preserve sign)", flags: "S Z H P/V N C" },
  SRL: { desc: "Shift right logical", flags: "S Z H P/V N C" },
  SUB: { desc: "Subtract from A", flags: "S Z H P/V N C" },
  XOR: { desc: "Logical XOR with A", flags: "S Z H P/V N C" },
};

export const Z80: CpuLanguage = {
  opcodes: new Set(Object.keys(DOCS)),
  opcodeDocs: DOCS,
};
