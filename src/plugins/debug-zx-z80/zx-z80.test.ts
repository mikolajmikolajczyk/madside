import { describe, expect, it } from 'vitest'
import type { CpuZ80State, RunBackend } from '@ports'
import { zxZ80DebugAdapter } from './zx-z80'
import { Z80_REGISTERS, Z80_FLAGS } from './z80'

const Z80: CpuZ80State = {
  pc: 0x8000, sp: 0xff00, af: 0x1234, bc: 0x5678, de: 0x9abc, hl: 0xdef0,
  ix: 0x1111, iy: 0x2222, ir: 0x3f00, af2: 0x0042, bc2: 0x0043, de2: 0x0044, hl2: 0x0045,
  im: 1, iff1: false, iff2: false,
  flags: { s: true, z: false, h: true, pv: false, n: true, c: false },
}

function fakeBackend(): RunBackend {
  return {
    width: 320, height: 256, sampleRate: 44100, pixels: new Uint32Array(0),
    loadMedia() {}, advanceFrame: () => 0, step: () => 0,
    cpuState: () => Z80, getPC: () => Z80.pc, isAtInstrBoundary: () => true,
    readMem: () => new Uint8Array(0), setBreakpoints() {},
    sendKey() {}, async startAudio() {}, async suspendAudio() {},
    saveState: () => null, loadState() {},
  } as unknown as RunBackend
}

describe('zx-z80 debug adapter', () => {
  it('exposes the Z80 register + flag descriptors (not 6502)', () => {
    const t = zxZ80DebugAdapter.attach(fakeBackend())
    expect(t.registers).toBe(Z80_REGISTERS)
    expect(t.flags).toBe(Z80_FLAGS)
    const ids = Z80_REGISTERS.map((r) => r.id)
    expect(ids).toContain('af')
    expect(ids).toContain('ix')
    expect(ids).toContain('hl2') // shadow bank
    expect(ids).not.toContain('x') // not a 6502
    // 16-bit pairs render as $XXXX.
    expect(Z80_REGISTERS.find((r) => r.id === 'af')?.width).toBe(2)
  })

  it('reads the Z80 register file from cpuState', async () => {
    const t = zxZ80DebugAdapter.attach(fakeBackend())
    const regs = await t.readRegisters()
    expect(regs).toMatchObject({
      pc: 0x8000, sp: 0xff00, af: 0x1234, bc: 0x5678, hl: 0xdef0, ix: 0x1111, hl2: 0x0045, im: 1,
    })
  })

  it('reads the Z80 flag set (S Z H P/V N C)', async () => {
    const t = zxZ80DebugAdapter.attach(fakeBackend())
    expect(await t.readFlags()).toEqual({ s: true, z: false, h: true, pv: false, n: true, c: false })
    expect(Z80_FLAGS.map((f) => f.id)).toEqual(['s', 'z', 'h', 'pv', 'n', 'c'])
  })

  it('has the expected plugin identity', () => {
    expect(zxZ80DebugAdapter.kind).toBe('debug-adapter')
    expect(zxZ80DebugAdapter.id).toBe('zx-z80-debug')
  })
})
