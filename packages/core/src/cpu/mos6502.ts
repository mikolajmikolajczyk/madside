// MOS 6502 instruction vocabulary — opcode mnemonics + hover docs. CPU-level
// (not toolchain-level): every 6502 assembler shares this set. Keyed by
// MachinePlugin.cpu — 'mos6502' (Atari) and 'ricoh-2a03' (NES) both resolve
// here (the 2A03 is the official 6502 set with decimal mode disabled; the
// mnemonics are identical). Lives in @core so both @ui (editor language) and
// @app (label scanner) can read it without crossing layers (ADR-0002).

export interface OpcodeDoc {
  /** One-line description shown in hover + autocomplete. */
  desc: string
  /** Affected status flags, e.g. "N Z C", "" (none), or "all". */
  flags: string
}

export interface CpuLanguage {
  /** Uppercase mnemonics the CPU understands. */
  opcodes: ReadonlySet<string>
  /** Per-mnemonic hover docs. */
  opcodeDocs: Readonly<Record<string, OpcodeDoc>>
}

// Docs are the single source of truth; the opcode set is derived from the keys
// below so the two can never drift.
const DOCS: Record<string, OpcodeDoc> = {
  ADC: { desc: "Add memory to A with carry", flags: "N V Z C" },
  AND: { desc: "Bitwise AND with A", flags: "N Z" },
  ASL: { desc: "Arithmetic shift left", flags: "N Z C" },
  BCC: { desc: "Branch if carry clear", flags: "" },
  BCS: { desc: "Branch if carry set", flags: "" },
  BEQ: { desc: "Branch if equal (Z set)", flags: "" },
  BIT: { desc: "Test bits in A vs memory", flags: "N V Z" },
  BMI: { desc: "Branch if minus (N set)", flags: "" },
  BNE: { desc: "Branch if not equal (Z clear)", flags: "" },
  BPL: { desc: "Branch if plus (N clear)", flags: "" },
  BRK: { desc: "Force interrupt", flags: "B I" },
  BVC: { desc: "Branch if overflow clear", flags: "" },
  BVS: { desc: "Branch if overflow set", flags: "" },
  CLC: { desc: "Clear carry flag", flags: "C" },
  CLD: { desc: "Clear decimal mode", flags: "D" },
  CLI: { desc: "Clear interrupt disable", flags: "I" },
  CLV: { desc: "Clear overflow flag", flags: "V" },
  CMP: { desc: "Compare A with memory", flags: "N Z C" },
  CPX: { desc: "Compare X with memory", flags: "N Z C" },
  CPY: { desc: "Compare Y with memory", flags: "N Z C" },
  DEC: { desc: "Decrement memory", flags: "N Z" },
  DEX: { desc: "Decrement X", flags: "N Z" },
  DEY: { desc: "Decrement Y", flags: "N Z" },
  EOR: { desc: "Bitwise XOR with A", flags: "N Z" },
  INC: { desc: "Increment memory", flags: "N Z" },
  INX: { desc: "Increment X", flags: "N Z" },
  INY: { desc: "Increment Y", flags: "N Z" },
  JMP: { desc: "Unconditional jump", flags: "" },
  JSR: { desc: "Jump to subroutine (push PC)", flags: "" },
  LDA: { desc: "Load A from memory", flags: "N Z" },
  LDX: { desc: "Load X from memory", flags: "N Z" },
  LDY: { desc: "Load Y from memory", flags: "N Z" },
  LSR: { desc: "Logical shift right", flags: "N Z C" },
  NOP: { desc: "No operation", flags: "" },
  ORA: { desc: "Bitwise OR with A", flags: "N Z" },
  PHA: { desc: "Push A onto stack", flags: "" },
  PHP: { desc: "Push processor status", flags: "" },
  PLA: { desc: "Pull A from stack", flags: "N Z" },
  PLP: { desc: "Pull processor status", flags: "all" },
  ROL: { desc: "Rotate left through carry", flags: "N Z C" },
  ROR: { desc: "Rotate right through carry", flags: "N Z C" },
  RTI: { desc: "Return from interrupt", flags: "all" },
  RTS: { desc: "Return from subroutine", flags: "" },
  SBC: { desc: "Subtract memory from A with borrow", flags: "N V Z C" },
  SEC: { desc: "Set carry flag", flags: "C" },
  SED: { desc: "Set decimal mode", flags: "D" },
  SEI: { desc: "Set interrupt disable", flags: "I" },
  STA: { desc: "Store A to memory", flags: "" },
  STX: { desc: "Store X to memory", flags: "" },
  STY: { desc: "Store Y to memory", flags: "" },
  TAX: { desc: "Transfer A to X", flags: "N Z" },
  TAY: { desc: "Transfer A to Y", flags: "N Z" },
  TSX: { desc: "Transfer stack pointer to X", flags: "N Z" },
  TXA: { desc: "Transfer X to A", flags: "N Z" },
  TXS: { desc: "Transfer X to stack pointer", flags: "" },
  TYA: { desc: "Transfer Y to A", flags: "N Z" },
}

export const MOS6502: CpuLanguage = {
  opcodes: new Set(Object.keys(DOCS)),
  opcodeDocs: DOCS,
}
