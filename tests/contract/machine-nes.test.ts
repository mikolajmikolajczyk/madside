import { describe, expect, it } from 'vitest'
import { machineNes } from '@plugins/machine-nes'

// Structural contract for the NES MachinePlugin. Not an end-to-end boot — that
// needs manifest-driven machine selection (separate task). These guard the
// data the workbench reads: media detection, memory-map coverage, render
// format, and the toolchain/emulator pairing the M9 validation path depends on.

describe('machine-nes', () => {
  it('detects iNES by magic, rejects anything else', () => {
    const ines = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0x01, 0x01])
    expect(machineNes.media?.detect(ines)).toBe('nes')
    expect(machineNes.media?.detect(new Uint8Array([0xff, 0xff]))).toBeUndefined()
    expect(machineNes.media?.detect(new Uint8Array([0x4e, 0x45, 0x53]))).toBeUndefined()
  })

  it('memory map covers the full 16-bit space with no gaps or overlaps', () => {
    const regions = [...machineNes.memoryMap].sort((a, b) => a.start - b.start)
    expect(regions[0]!.start).toBe(0x0000)
    expect(regions[regions.length - 1]!.end).toBe(0xffff)
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.start).toBe(regions[i - 1]!.end + 1)
    }
  })

  it('renders via the rgba8888 fast path at NES NTSC dimensions', () => {
    expect(machineNes.display).toMatchObject({ width: 256, height: 240, pixelFormat: 'rgba8888' })
  })

  it('pairs MADS + jsnes for the M9 validation path', () => {
    expect(machineNes.compatibleToolchains).toContain('mads')
    expect(machineNes.compatibleEmulators).toContain('jsnes')
    expect(machineNes.media?.defaultFormat).toBe('nes')
  })

  it('maps the standard pad and ships PPU register equates', () => {
    // 8 buttons → jsnes Controller.BUTTON_* indices 0..7, each used once.
    const indices = Object.values(machineNes.input.codeToKey ?? {}).sort((a, b) => a - b)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(machineNes.bootEquates?.path).toBe('src/nes.a65')
    expect(machineNes.bootEquates?.content).toMatch(/PPUCTRL\s*=\s*\$2000/)
  })
})
