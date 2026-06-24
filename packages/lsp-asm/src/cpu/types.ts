// CPU opcode knowledge for the assembly LSP — the rich hint data (description,
// affected flags, addressing modes) the engine surfaces in hover, completion,
// and addressing-mode diagnostics. This is editor *intelligence*, so it lives
// in the LSP (loaded only in the language worker), NOT in @core/cpu — core keeps
// only the bare opcode mnemonic SET that label-scanning + highlighting need
// without an LSP (the locked @core/cpu split, ADR-0009 note).

/** One addressing mode / operand form an instruction accepts. */
export interface OpcodeMode {
  /** Short mode name, e.g. 'immediate', 'zeropage,X', 'register indirect'. */
  mode: string
  /** Operand syntax template, e.g. '#$nn', '$nnnn,X', 'A,(HL)'. Empty for
   *  implied/no-operand forms. */
  syntax: string
  /** Encoded instruction length in bytes, when fixed for the mode (6502).
   *  Omitted where it varies / isn't modelled (z80 operand forms). */
  bytes?: number
}

/** Rich per-mnemonic hint: what it does, which flags it touches, the addressing
 *  modes / operand forms it accepts. */
export interface OpcodeInfo {
  /** One-line description (shown in hover + completion detail). */
  desc: string
  /** Affected status flags, e.g. 'N V Z C', '' (none), or 'all'. */
  flags: string
  /** Addressing modes / operand forms. May be empty when not modelled. */
  modes: OpcodeMode[]
}

/** A CPU's opcode hint table — keyed by UPPERCASE mnemonic. The mnemonic set is
 *  derived from the keys (single source of truth, can't drift). */
export interface CpuOpcodes {
  readonly info: Readonly<Record<string, OpcodeInfo>>
  /** Uppercase mnemonics, derived from `info` keys. */
  readonly mnemonics: ReadonlySet<string>
}

/** Build a `CpuOpcodes` from an info table, deriving the mnemonic set. */
export function cpuOpcodes(info: Record<string, OpcodeInfo>): CpuOpcodes {
  return { info, mnemonics: new Set(Object.keys(info)) }
}
