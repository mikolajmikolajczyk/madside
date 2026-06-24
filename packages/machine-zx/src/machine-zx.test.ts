import { describe, expect, it } from 'vitest'
import { machineZx } from './machine-zx'

describe('machine-zx', () => {
  it('is a Z80 ZX Spectrum machine', () => {
    expect(machineZx.kind).toBe('machine')
    expect(machineZx.id).toBe('zx-spectrum')
    expect(machineZx.cpu).toBe('z80')
    expect(machineZx.compatibleToolchains).toContain('z88dk')
    expect(machineZx.compatibleEmulators).toContain('zx-chips')
    expect(machineZx.compatibleDebugAdapters).toContain('zx-z80-debug')
  })

  it('maps the 48K address space (ROM / screen / attrs / RAM)', () => {
    const rom = machineZx.memoryMap[0]
    expect(rom).toMatchObject({ start: 0x0000, end: 0x3fff, kind: 'rom' })
    // Last region runs to the top of the 64K bus.
    expect(machineZx.memoryMap.at(-1)?.end).toBe(0xffff)
    // Screen bitmap + attributes are at the canonical ZX addresses.
    expect(machineZx.memoryMap.some((r) => r.start === 0x4000)).toBe(true)
    expect(machineZx.memoryMap.some((r) => r.start === 0x5800)).toBe(true)
  })

  describe('media.detect', () => {
    const detect = (n: number, head: number[] = []) => {
      const b = new Uint8Array(n)
      head.forEach((v, i) => (b[i] = v))
      return machineZx.media!.detect(b)
    }
    it('detects a 48K .sna by its 49179-byte size', () => {
      expect(detect(49179)).toBe('sna')
    })
    it('detects a .scr screen dump by its 6912-byte size', () => {
      expect(detect(6912)).toBe('scr')
    })
    it('detects .tzx by the "ZXTape!\\x1a" signature', () => {
      expect(detect(64, [0x5a, 0x58, 0x54, 0x61, 0x70, 0x65, 0x21, 0x1a])).toBe('tzx')
    })
    it('returns undefined for unkeyed data (falls back to ext/default)', () => {
      expect(detect(1024)).toBeUndefined()
      expect(machineZx.media!.defaultFormat).toBe('tap')
    })
    it('the z88dk build output (.sna) must export as .sna, not the .tap default (#138)', () => {
      // The toolchain emits a 48K .sna, but the machine default-loads .tap — so
      // Export must name the file by detecting the bytes, not by defaultFormat.
      expect(machineZx.media!.defaultFormat).toBe('tap') // the trap
      expect(detect(49179)).toBe('sna') // ...what export must actually use
    })
  })
})
