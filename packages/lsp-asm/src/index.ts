// @madside/lsp-asm — generic assembly language intelligence. The CPU opcode-hint
// tables (description + flags + addressing modes) and the per-assembler dialect
// profiles that drive hover, completion, go-to-definition, references, rename,
// diagnostics, and semantic highlighting. The dialect profiles are pure data, so
// adding a target = adding a profile (ADR-0009). The engine + LanguageProvider
// adapter (browser/node worker entries) land on top of these foundations.

export type { AsmDialect } from './dialect'
export { madsDialect, ca65Dialect, z80asmDialect, getAsmDialect, ASM_DIALECTS } from './dialects'
export {
  MOS6502,
  Z80,
  getCpuOpcodes,
  type CpuOpcodes,
  type OpcodeInfo,
  type OpcodeMode,
} from './cpu'
