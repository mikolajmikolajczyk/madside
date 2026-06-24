// CPU register + condition names. The engine excludes these from symbol
// reference detection (so `LDA value,X` references `value`, not `X`) and from
// undefined-symbol diagnostics. Registers are matched case-insensitively even in
// case-sensitive-symbol assemblers (ca65/z80asm fold register case).

/** MOS 6502 registers (shared by mads + ca65). */
export const REG_6502: ReadonlySet<string> = new Set(['A', 'X', 'Y', 'S', 'P', 'SP', 'PC'])

/** Z80 registers, register pairs, and condition codes. */
export const REG_Z80: ReadonlySet<string> = new Set([
  'A', 'F', 'B', 'C', 'D', 'E', 'H', 'L', 'I', 'R',
  'AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP', 'PC',
  'IXH', 'IXL', 'IYH', 'IYL',
  // condition codes used by JP/JR/CALL/RET
  'NZ', 'Z', 'NC', 'PO', 'PE', 'M',
])
