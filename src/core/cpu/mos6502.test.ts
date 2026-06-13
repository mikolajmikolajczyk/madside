import { describe, expect, it } from 'vitest'
import { MOS6502, getCpuLanguage } from './index'

describe('MOS6502 cpu language', () => {
  it('derives the opcode set from the docs keys (no drift)', () => {
    expect(MOS6502.opcodes.size).toBe(Object.keys(MOS6502.opcodeDocs).length)
    for (const op of MOS6502.opcodes) {
      expect(MOS6502.opcodeDocs[op]).toBeDefined()
    }
    // Spot-check the official 56-mnemonic set is present.
    expect(MOS6502.opcodes.has('LDA')).toBe(true)
    expect(MOS6502.opcodes.has('RTS')).toBe(true)
    expect(MOS6502.opcodeDocs.ADC).toEqual({ desc: 'Add memory to A with carry', flags: 'N V Z C' })
  })

  it('resolves both 6502 machine cpus to the shared vocabulary', () => {
    expect(getCpuLanguage('mos6502')).toBe(MOS6502)
    expect(getCpuLanguage('ricoh-2a03')).toBe(MOS6502)
    expect(getCpuLanguage('z80')).toBeUndefined()
  })
})
