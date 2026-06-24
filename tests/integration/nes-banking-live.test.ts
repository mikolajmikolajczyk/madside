// LIVE-CORE proof for NES PRG banking (ADR-0014 Phase 2, #134). The NES mapper
// latch is WRITE-ONLY — unlike Atari's bus-readable PORTB, the live bank can't
// be read off the bus, so the jsnes backend tracks it by intercepting the
// mapper's loadRomBank. This test runs a hand-built 3-bank UNROM (mapper 2) ROM
// on the real jsnes core and watches the SAME $8000 breakpoint resolve to PRG
// bank 0, then bank 1, as execution flows between the switchable banks — reusing
// the Phase-1 bank-match engine unchanged.

import { describe, expect, it } from 'vitest'
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

// Minimal MMC3 (mapper 4) iNES image — 32 KB PRG (4 × 8 KB banks), CHR-RAM. The
// fixed last 8 KB bank ($E000) holds reset, which selects PRG bank 0 then bank 1
// into the switchable $8000 slot (slot 6) via the MMC3 register protocol
// (write slot to $8000, value to $8001). Proves the window layout is *derived
// from the mapper*: MMC3 banks PRG in 8 KB units, so four 8 KB windows appear.
function buildMmc3Rom(): Uint8Array {
  const B = 8192
  const header = [0x4e, 0x45, 0x53, 0x1a, 2, 0, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const banks = [0, 1, 2, 3].map(() => new Uint8Array(B).fill(0xff))
  banks[3]!.set(
    [
      0x78, 0xd8, 0xa2, 0xff, 0x9a,
      0xa9, 0x06, 0x8d, 0x00, 0x80, 0xa9, 0x00, 0x8d, 0x01, 0x80, // slot 6 (PRG $8000) = bank 0
      0xa9, 0x06, 0x8d, 0x00, 0x80, 0xa9, 0x01, 0x8d, 0x01, 0x80, // slot 6 = bank 1
      0x4c, 0x19, 0xe0, // jmp $E019 (loop)
    ],
    0,
  )
  banks[3]!.set([0x00, 0xe0, 0x00, 0xe0, 0x00, 0xe0], 0x1ffa) // vectors → $E000
  return Uint8Array.from([...header, ...banks[0]!, ...banks[1]!, ...banks[2]!, ...banks[3]!])
}

describe('NES PRG bank-aware debugging on the real jsnes core (ADR-0014 Phase 2)', () => {
  it('the same $8000 breakpoint resolves to PRG bank 0, then bank 1, as the program switches', async () => {
    // Real backend via the plugin. The PRG windows are derived from the loaded
    // mapper (no static declaration) — UxROM uses 16 KB loadRomBank, so two
    // 16 KB windows appear: $8000 (switchable) and $C000 (fixed last bank).
    const backend = await jsnesEmulator.createBackend()
    backend.loadMedia('nes', buildUnromRom())

    // Power-on mapping captured by the loadRomBank wrapper: $8000 → bank 0,
    // $C000 → the fixed last bank (2).
    expect(backend.bankMap!()).toEqual([
      { window: 'prg-8000', start: 0x8000, end: 0xbfff, space: 'bank0', bankOffset: 0 },
      { window: 'prg-c000', start: 0xc000, end: 0xffff, space: 'bank2', bankOffset: 2 * BANK },
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

  it('derives 8 KB windows for an MMC3 ROM — no hardcoded layout', async () => {
    const backend = await jsnesEmulator.createBackend()
    backend.loadMedia('nes', buildMmc3Rom())

    // MMC3 banks PRG in 8 KB units → four 8 KB windows, not UxROM's two 16 KB.
    // Power-on: $8000→0, $A000→1, $C000→2, $E000→3 (the two fixed banks last).
    expect(backend.bankMap!()).toEqual([
      { window: 'prg-8000', start: 0x8000, end: 0x9fff, space: 'bank0', bankOffset: 0 },
      { window: 'prg-a000', start: 0xa000, end: 0xbfff, space: 'bank1', bankOffset: 8192 },
      { window: 'prg-c000', start: 0xc000, end: 0xdfff, space: 'bank2', bankOffset: 2 * 8192 },
      { window: 'prg-e000', start: 0xe000, end: 0xffff, space: 'bank3', bankOffset: 3 * 8192 },
    ])

    // Reset switches the $8000 slot to PRG bank 1 — the window updates live.
    for (let i = 0; i < 8; i++) backend.advanceFrame()
    expect(backend.bankMap!()[0]).toMatchObject({ start: 0x8000, end: 0x9fff, space: 'bank1' })
  })
})
