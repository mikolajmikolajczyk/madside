import type { MachinePlugin } from '@ports'
import { machineZx } from './machine-zx'

// Sinclair ZX Spectrum 128K (PAL). A SEPARATE machine from the 48K — not a
// config of it (ADR-0014). The 128K adds the $7FFD paging port (absent on the
// 48K, where writes to it do nothing) which banks one of 8 RAM banks into
// $C000-$FFFF, plus the AY-3-8912 sound chip. Running a 48K title as 128K is NOT
// faithful: a 48K program that accidentally hits $7FFD would page (and could
// crash / blank), and the +2A/+3 contention differs — so the faithful 48K keeps
// its own machine (`zx-spectrum`, ZX_TYPE_48K) and this is `zx128`
// (ZX_TYPE_128). Both share the chips core (zx-chips) + the z88dk toolchain +
// the Z80 debug adapter; the bank-window declaration below is what makes the
// emulator boot the 128K core and expose a live bankMap().
export const machineZx128: MachinePlugin = {
  ...machineZx,
  id: 'zx128',
  name: 'ZX Spectrum 128K',

  // 128K memory map. ROM at $0000 is paged ($7FFD bit 4 = 128K editor / 48K
  // BASIC); $4000 + $8000 are fixed RAM banks (5 + 2); $C000-$FFFF is the
  // switchable window (one of 8 RAM banks, selected by $7FFD bits 0-2).
  memoryMap: [
    { start: 0x0000, end: 0x3fff, name: 'ROM (paged)', kind: 'rom', writable: false },
    { start: 0x4000, end: 0x57ff, name: 'Screen bitmap (bank 5)', kind: 'ram', writable: true },
    { start: 0x5800, end: 0x5aff, name: 'Screen attributes (bank 5)', kind: 'ram', writable: true },
    { start: 0x5b00, end: 0x7fff, name: 'RAM (bank 5)', kind: 'ram', writable: true },
    { start: 0x8000, end: 0xbfff, name: 'RAM (bank 2)', kind: 'ram', writable: true },
    { start: 0xc000, end: 0xffff, name: 'RAM (paged bank, $7FFD)', kind: 'ram', writable: true },
  ],

  // The $C000-$FFFF window banks one of 8 RAM banks via $7FFD bits 0-2. The
  // selector is WRITE-ONLY (the 48K had no such port), so no bus-readable
  // `selector` is declared — the chips backend supplies the live bank from its
  // tracked last_mem_config (ADR-0014). Declaring `banks` is also what makes the
  // zx-chips plugin boot the 128K core instead of the 48K one.
  banks: [
    { id: 'main', start: 0xc000, end: 0xffff, bankCount: 8, spacePrefix: 'bank' },
  ],

  devices: [
    { id: 'ula', name: 'ULA (display / border / beeper / keyboard)' },
    { id: 'ay', name: 'AY-3-8912 (sound)' },
  ],

  bootEquates: {
    path: 'src/zx.inc',
    content: `; common ZX Spectrum 128K equates (z80asm syntax)
ULA_PORT  equ $fe        ; IN/OUT: border+beeper (write), keyboard+EAR (read)
MEMPAGE   equ $7ffd       ; 128K paging latch (write-only): bits 0-2 = $C000 RAM bank,
                          ;   bit 3 = screen, bit 4 = ROM, bit 5 = paging lock
SCREEN    equ $4000      ; 6144-byte pixel bitmap (bank 5)
ATTRS     equ $5800      ; 768-byte attribute map
`,
  },
}
