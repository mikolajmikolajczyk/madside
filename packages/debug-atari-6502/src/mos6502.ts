// Generic MOS 6502 register + flag layout. Shared between machines that host
// a 6502/6510/2A03 (Atari XL, C64, NES). Plugin-debug-* implementations import
// these constants instead of re-declaring them; that keeps the Atari + NES
// debugger UIs identical down to label text.

import type { FlagDescriptor, RegisterDescriptor } from '@ports'

export const MOS6502_REGISTERS: readonly RegisterDescriptor[] = [
  { id: 'a', label: 'A', width: 1 },
  { id: 'x', label: 'X', width: 1 },
  { id: 'y', label: 'Y', width: 1 },
  { id: 'pc', label: 'PC', width: 2 },
  { id: 'sp', label: 'SP', width: 1 },
]

export const MOS6502_FLAGS: readonly FlagDescriptor[] = [
  { id: 'n', label: 'N' },
  { id: 'v', label: 'V' },
  { id: 'b', label: 'B' },
  { id: 'd', label: 'D' },
  { id: 'i', label: 'I' },
  { id: 'z', label: 'Z' },
  { id: 'c', label: 'C' },
]
