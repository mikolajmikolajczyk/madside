// LIVE-CORE proof for NES PRG banking (ADR-0014 Phase 2, #134). The NES mapper
// latch is WRITE-ONLY — unlike Atari's bus-readable PORTB, the live bank can't
// be read off the bus, so the jsnes backend tracks it by intercepting the
// mapper's loadRomBank. This test runs a hand-built 3-bank UNROM (mapper 2) ROM
// on the real jsnes core and watches the SAME $8000 breakpoint resolve to PRG
// bank 0, then bank 1, as execution flows between the switchable banks — reusing
// the Phase-1 bank-match engine unchanged.

import { describe, expect, it } from 'vitest'
import { machineNes } from '@madside/machine-nes'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'
import { breakpointFires, splitBreakpoints } from '@ports'

const BANK = 16384

// 3-bank UNROM iNES image. Banks 0 and 1 each run at the switchable $8000
// window; bank 2 is the fixed last bank ($C000) holding reset + a trampoline +
// vectors. Flow: reset selects bank 0 and jumps to $8000 (bank 0 runs, jumps to
// the fixed trampoline), the trampoline selects bank 1 and jumps to $8000
// (bank 1 loops). So the PC hits $8000 first with bank 0 live, then bank 1.
function buildUnromRom(): Uint8Array {
  const header = [0x4e, 0x45, 0x53, 0x1a, 3, 0, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const bank0 = new Uint8Array(BANK).fill(0xff)
  bank0.set([0x4c, 0x10, 0xc0], 0) // $8000: jmp $C010 (fixed trampoline)
  const bank1 = new Uint8Array(BANK).fill(0xff)
  bank1.set([0x4c, 0x00, 0x80], 0) // $8000: jmp $8000 (loop in bank 1)
  const bank2 = new Uint8Array(BANK).fill(0xff)
  // $C000 reset: sei; cld; ldx #$ff; txs; lda #0; sta $8000; jmp $8000
  bank2.set([0x78, 0xd8, 0xa2, 0xff, 0x9a, 0xa9, 0x00, 0x8d, 0x00, 0x80, 0x4c, 0x00, 0x80], 0)
  // $C010 trampoline: lda #1; sta $8000; jmp $8000
  bank2.set([0xa9, 0x01, 0x8d, 0x00, 0x80, 0x4c, 0x00, 0x80], 0x10)
  bank2.set([0x40], 0x20) // $C020: rti
  bank2.set([0x20, 0xc0, 0x00, 0xc0, 0x20, 0xc0], 0x3ffa) // vectors: nmi=$C020 reset=$C000 irq=$C020
  return Uint8Array.from([...header, ...bank0, ...bank1, ...bank2])
}

describe('NES PRG bank-aware debugging on the real jsnes core (ADR-0014 Phase 2)', () => {
  it('the same $8000 breakpoint resolves to PRG bank 0, then bank 1, as the program switches', async () => {
    // Real backend via the plugin, with the machine's declared PRG windows.
    const backend = await jsnesEmulator.createBackend(machineNes.banks)
    backend.loadMedia('nes', buildUnromRom())

    // Power-on mapping captured by the loadRomBank wrapper: $8000 → bank 0,
    // $C000 → the fixed last bank (2).
    expect(backend.bankMap!()).toEqual([
      { window: 'prg-lo', start: 0x8000, end: 0xbfff, space: 'bank0', bankOffset: 0 },
      { window: 'prg-hi', start: 0xc000, end: 0xffff, space: 'bank2', bankOffset: 2 * BANK },
    ])

    const runToWindow = (): boolean => {
      backend.setBreakpoints([0x8000])
      const at = () => backend.isAtInstrBoundary() && backend.getPC() === 0x8000
      for (let i = 0; i < 200; i++) {
        backend.advanceFrame(at)
        if (at()) return true
      }
      return false
    }
    // The live PRG bank in the $8000 window, named by the bank-aware predicate.
    const liveBankAt8000 = () => {
      const map = backend.bankMap!()
      return breakpointFires(0x8000, splitBreakpoints([{ addr: 0x8000, space: 'bank0' }]), map)
        ? 'bank0'
        : breakpointFires(0x8000, splitBreakpoints([{ addr: 0x8000, space: 'bank1' }]), map)
          ? 'bank1'
          : null
    }

    // First visit: bank 0 is mapped (reset selected it).
    expect(runToWindow(), 'PC never reached $8000').toBe(true)
    expect(liveBankAt8000()).toBe('bank0')

    // Step past, let the flow run bank 0 → trampoline → bank 1, stop at $8000.
    backend.step()
    expect(runToWindow(), 'PC never returned to $8000 in bank 1').toBe(true)
    expect(liveBankAt8000()).toBe('bank1')
  })
})
