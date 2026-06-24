// CPU register + condition names. The engine excludes these from symbol
// reference detection (so `LDA value,X` references `value`, not `X`) and from
// undefined-symbol diagnostics. Registers are matched case-insensitively even in
// case-sensitive-symbol assemblers (ca65/z80asm fold register case).

/** MOS 6502 registers (shared by mads + ca65). */
export const REG_6502: ReadonlySet<string> = new Set(['A', 'X', 'Y', 'S', 'P', 'SP', 'PC'])

/** Motorola 68000 registers (data, address, stack, status). Xn index forms
 *  (e.g. d(An,D0)) reference these too. */
export const REG_M68K: ReadonlySet<string> = new Set([
  'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7',
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
  'SP', 'USP', 'PC', 'SR', 'CCR',
])

/** Z80 registers, register pairs, and condition codes. */
export const REG_Z80: ReadonlySet<string> = new Set([
  'A', 'F', 'B', 'C', 'D', 'E', 'H', 'L', 'I', 'R',
  'AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP', 'PC',
  'IXH', 'IXL', 'IYH', 'IYL',
  // condition codes used by JP/JR/CALL/RET
  'NZ', 'Z', 'NC', 'PO', 'PE', 'M',
])
