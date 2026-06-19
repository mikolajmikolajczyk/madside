import { describe, expect, it } from 'vitest'
import { machineC64 } from '@plugins/machine-c64'

// Structural contract for the C64 MachinePlugin (issue #53). Not an end-to-end
// boot — that runs the wasm chips core in the browser. These guard the data the
// workbench reads: .prg detection, memory-map coverage, render format, and the
// toolchain/emulator pairing the build→boot path depends on.

describe('machine-c64', () => {
  it('detects a cc65 .prg by its $0801 load address, rejects anything else', () => {
    const prg = new Uint8Array([0x01, 0x08, 0x0b, 0x08, 0x0a, 0x00])
    expect(machineC64.media?.detect(prg)).toBe('prg')
    expect(machineC64.media?.detect(new Uint8Array([0xff, 0xff]))).toBeUndefined()
    expect(machineC64.media?.detect(new Uint8Array([0x01]))).toBeUndefined()
  })

  it('memory map covers the full 16-bit space with no gaps or overlaps', () => {
    const regions = [...machineC64.memoryMap].sort((a, b) => a.start - b.start)
    expect(regions[0]!.start).toBe(0x0000)
    expect(regions[regions.length - 1]!.end).toBe(0xffff)
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.start).toBe(regions[i - 1]!.end + 1)
    }
  })

  it('renders via the rgba8888 fast path at C64 PAL dimensions', () => {
    expect(machineC64.display).toMatchObject({ width: 392, height: 272, pixelFormat: 'rgba8888' })
  })

  it('pairs cc65 + the chips C64 core for the build→boot path', () => {
    expect(machineC64.compatibleToolchains).toContain('cc65')
    expect(machineC64.compatibleEmulators).toContain('chips-c64')
    expect(machineC64.media?.defaultFormat).toBe('prg')
  })

  it('exposes the VIC/SID/CIA devices and ships KERNAL equates', () => {
    const chips = machineC64.devices?.map((d) => d.id).sort()
    expect(chips).toEqual(['cia1', 'cia2', 'sid', 'vic'])
    expect(machineC64.bootEquates?.path).toBe('src/c64.a65')
    expect(machineC64.bootEquates?.content).toMatch(/CHROUT\s*=\s*\$FFD2/)
  })
})
