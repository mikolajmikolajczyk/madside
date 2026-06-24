// Maps the active project toolchain id (manifest.toolchain) to the assembly LSP
// dialect the editor should run (@madside/lsp-asm). Returns undefined when the
// toolchain has no asm dialect yet (e.g. clownassembler / M68k — no opcode table)
// so the editor falls back to plain StreamLanguage highlighting.

const TOOLCHAIN_TO_DIALECT: Record<string, string> = {
  mads: 'mads',
  ca65: 'ca65',
  z88dk: 'z80asm',
}

/** The asm LSP dialect id for a toolchain id, or undefined if unsupported. */
export function asmDialectFor(toolchainId?: string): string | undefined {
  return toolchainId ? TOOLCHAIN_TO_DIALECT[toolchainId] : undefined
}
