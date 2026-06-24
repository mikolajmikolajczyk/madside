import { describe, expect, it } from 'vitest'
import { Z80, getCpuLanguage } from './index'

describe('Z80 cpu language', () => {
  it('carries the Z80 opcode set, distinct from the 6502', () => {
    // Spot-check Z80-distinctive mnemonics the 6502 set lacks.
    expect(Z80.opcodes.has('LD')).toBe(true)
    expect(Z80.opcodes.has('LDIR')).toBe(true)
    expect(Z80.opcodes.has('EXX')).toBe(true)
    expect(Z80.opcodes.has('DJNZ')).toBe(true)
    expect(Z80.opcodes.has('JMP')).toBe(false) // 6502, not Z80
  })

  it('resolves the z80 machine cpu to the Z80 vocabulary', () => {
    expect(getCpuLanguage('z80')).toBe(Z80)
    // ...and is distinct from the 6502 set.
    expect(getCpuLanguage('z80')).not.toBe(getCpuLanguage('mos6502'))
  })
})
