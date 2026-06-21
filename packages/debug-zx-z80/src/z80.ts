// Z80 register + flag layout for the debugger panel. The Z80 is a different ISA
// from the 6502 family (different registers, 16-bit pairs, a shadow bank, and
// the S Z H P/V N C flag set), so it gets its own descriptors instead of the
// shared MOS6502_* ones. The registers panel is descriptor-driven, so declaring
// these is all it takes to render a correct Z80 view.

import type { FlagDescriptor, RegisterDescriptor } from '@ports'

export const Z80_REGISTERS: readonly RegisterDescriptor[] = [
  { id: 'pc', label: 'PC', width: 2 },
  { id: 'sp', label: 'SP', width: 2 },
  { id: 'af', label: 'AF', width: 2 },
  { id: 'bc', label: 'BC', width: 2 },
  { id: 'de', label: 'DE', width: 2 },
  { id: 'hl', label: 'HL', width: 2 },
  { id: 'ix', label: 'IX', width: 2 },
  { id: 'iy', label: 'IY', width: 2 },
  { id: 'ir', label: 'IR', width: 2 },
  // Alternate (shadow) bank.
  { id: 'af2', label: "AF'", width: 2 },
  { id: 'bc2', label: "BC'", width: 2 },
  { id: 'de2', label: "DE'", width: 2 },
  { id: 'hl2', label: "HL'", width: 2 },
  { id: 'im', label: 'IM', width: 1 },
]

export const Z80_FLAGS: readonly FlagDescriptor[] = [
  { id: 's', label: 'S' },
  { id: 'z', label: 'Z' },
  { id: 'h', label: 'H' },
  { id: 'pv', label: 'P/V' },
  { id: 'n', label: 'N' },
  { id: 'c', label: 'C' },
]
