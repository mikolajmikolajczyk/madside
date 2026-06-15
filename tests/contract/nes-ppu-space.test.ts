import { describe, expect, it } from 'vitest'
import { jsnesEmulator } from '@plugins/emulator-nes-jsnes'
import { machineNes } from '@plugins/machine-nes'

// Build the backend through the EmulatorPlugin contract (jsnes boots headless).
const newBackend = () => jsnesEmulator.createBackend()

// The PPU viewer reads the 'ppu' + 'oam' memory spaces declared in
// machine-nes.memorySpaces. This guards that the backend routes those space
// ids to the jsnes PPU VRAM / OAM (the panel's data path) and rejects unknown
// spaces — the universal named-memory-space mechanism, not a PPU-specific API.

// Minimal structural view of the jsnes internals the test pokes.
interface PpuPeek {
  nes: { ppu: { vramMem: Uint8Array; spriteMem: Uint8Array } }
}

describe('NES backend named memory spaces', () => {
  it('declares ppu + oam spaces on the MachinePlugin', () => {
    const ids = machineNes.memorySpaces?.map((s) => s.id)
    expect(ids).toContain('ppu')
    expect(ids).toContain('oam')
  })

  it("reads the 'ppu' space from PPU VRAM", async () => {
    const be = await newBackend()
    const ppu = (be as unknown as PpuPeek).nes.ppu
    ppu.vramMem[0x3f00] = 0x21
    ppu.vramMem[0x3f01] = 0x0a
    const pal = be.readMem(0x3f00, 32, 'ppu')
    expect(pal[0]).toBe(0x21)
    expect(pal[1]).toBe(0x0a)
  })

  it("reads the 'oam' space from sprite memory", async () => {
    const be = await newBackend()
    const ppu = (be as unknown as PpuPeek).nes.ppu
    ppu.spriteMem[4] = 0xab
    expect(be.readMem(4, 1, 'oam')[0]).toBe(0xab)
  })

  it("defaults to the CPU space and rejects unknown spaces", async () => {
    const be = await newBackend()
    expect(be.readMem(0, 16).length).toBe(16)
    expect(be.readMem(0, 16, 'cpu').length).toBe(16)
    expect(() => be.readMem(0, 1, 'vic')).toThrow(/unknown space/)
  })
})
