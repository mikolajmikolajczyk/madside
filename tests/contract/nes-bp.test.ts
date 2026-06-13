import { describe, expect, it } from 'vitest'
import { JsnesBackend } from '@plugins/emulator-nes-jsnes'

// Breakpoint semantics on the jsnes backend. The interesting cases are the
// reset-entry instruction (PC sits on it after load — jsnes loads it lazily,
// so the backend seeds REG_PC to make it observable) and resume (Run after a
// pause must step over the BP it's sitting on, not re-trap in place).

// Minimal NROM: 16-byte iNES header + 16 KB PRG, CHR-RAM (CHR banks = 0).
// Code lives at $C000; reset vector → $C000.
function nrom(code: number[]): Uint8Array {
  const rom = new Uint8Array(16 + 16384)
  rom.set([0x4e, 0x45, 0x53, 0x1a, 0x01, 0x00, 0x00, 0x00], 0)
  rom.set(code, 16)
  rom[16 + 0x3ffc] = 0x00 // reset lo
  rom[16 + 0x3ffd] = 0xc0 // reset hi → $C000
  return rom
}

// sei ($C000) ; cld ($C001) ; jmp $C002 ($C002, self-loop)
const PROGRAM = [0x78, 0xd8, 0x4c, 0x02, 0xc0]

describe('JsnesBackend breakpoints', () => {
  it('seeds PC to the reset entry so it is observable after load', () => {
    const be = new JsnesBackend()
    be.loadMedia('nes', nrom(PROGRAM))
    expect(be.getPC()).toBe(0xc000)
  })

  it('traps on a breakpoint at the reset-entry instruction', () => {
    const be = new JsnesBackend()
    be.loadMedia('nes', nrom(PROGRAM))
    be.setBreakpoints([0xc000])
    be.advanceFrame()
    // Trapped before executing the entry instruction — PC unmoved.
    expect(be.getPC()).toBe(0xc000)
  })

  it('steps over the trapped instruction on resume instead of re-trapping', () => {
    const be = new JsnesBackend()
    be.loadMedia('nes', nrom(PROGRAM))
    be.setBreakpoints([0xc000])
    be.advanceFrame() // traps at $C000
    expect(be.getPC()).toBe(0xc000)
    be.advanceFrame() // resume — must move past $C000
    expect(be.getPC()).not.toBe(0xc000)
  })

  it('traps before executing a breakpoint reached mid-program', () => {
    const be = new JsnesBackend()
    be.loadMedia('nes', nrom(PROGRAM))
    be.setBreakpoints([0xc002])
    be.advanceFrame()
    // Paused on the jmp at $C002, before it executes.
    expect(be.getPC()).toBe(0xc002)
  })
})
