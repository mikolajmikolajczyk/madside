// Motorola 68000 register + flag layout for the debugger panel (#145). A 32-bit,
// alien ISA versus the 6502/Z80 families: eight 32-bit data registers (D0–D7),
// eight 32-bit address registers (A0–A7, A7 = SP), a 32-bit PC over the 24-bit
// bus, and a 16-bit status register. The panel is descriptor-driven, so these are
// all it takes to render a correct 68000 view — proving the debug contract isn't
// 8/16-bit-register-centric.

import type { FlagDescriptor, RegisterDescriptor } from '@ports'

const data = Array.from({ length: 8 }, (_, i): RegisterDescriptor => ({ id: `d${i}`, label: `D${i}`, width: 4 }))
const addr = Array.from({ length: 8 }, (_, i): RegisterDescriptor => ({ id: `a${i}`, label: `A${i}`, width: 4 }))

export const M68K_REGISTERS: readonly RegisterDescriptor[] = [
  { id: 'pc', label: 'PC', width: 4 },
  { id: 'sr', label: 'SR', width: 2 },
  ...data,
  ...addr,
]

// Condition codes from the SR low byte (CCR): X(4) N(3) Z(2) V(1) C(0).
export const M68K_FLAGS: readonly FlagDescriptor[] = [
  { id: 'x', label: 'X' },
  { id: 'n', label: 'N' },
  { id: 'z', label: 'Z' },
  { id: 'v', label: 'V' },
  { id: 'c', label: 'C' },
]
