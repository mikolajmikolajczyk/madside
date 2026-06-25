// Maps the active project toolchain id (manifest.toolchain) to the assembly LSP
// dialect the editor should run (@madside/lsp-asm).

const TOOLCHAIN_TO_DIALECT: Record<string, string> = {
  mads: 'mads',
  ca65: 'ca65',
  z88dk: 'z80asm',
  clownassembler: 'clownassembler',
}

/** The asm LSP dialect id for a file, or undefined if unsupported. Normally
 *  follows the project toolchain, but a `.s80` source is the Genesis Z80 driver
 *  — assembled by z80asm and embedded into the M68k ROM (#147), so it uses the
 *  z80 dialect regardless of the project's (clownassembler/M68k) toolchain.
 *  Without this its Z80 registers (`a`, `bc`, …) read as undefined symbols. */
export function asmDialectFor(toolchainId?: string, path?: string): string | undefined {
  if (path && /\.s80$/i.test(path)) return 'z80asm'
  return toolchainId ? TOOLCHAIN_TO_DIALECT[toolchainId] : undefined
}
