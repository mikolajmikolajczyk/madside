import { describe, expect, it } from 'vitest'
import { MOS6502, getCpuLanguage } from './index'

describe('MOS6502 cpu language', () => {
  it('carries the official 56-mnemonic 6502 opcode set', () => {
    expect(MOS6502.opcodes.size).toBe(56)
    expect(MOS6502.opcodes.has('LDA')).toBe(true)
    expect(MOS6502.opcodes.has('RTS')).toBe(true)
    expect(MOS6502.opcodes.has('ADC')).toBe(true)
  })

  it('resolves both 6502 machine cpus to the shared vocabulary', () => {
    expect(getCpuLanguage('mos6502')).toBe(MOS6502)
    expect(getCpuLanguage('ricoh-2a03')).toBe(MOS6502)
    expect(getCpuLanguage('mos6510')).toBe(MOS6502) // C64
    expect(getCpuLanguage('unknown-cpu')).toBeUndefined()
  })
})
