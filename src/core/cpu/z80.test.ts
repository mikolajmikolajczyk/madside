import { describe, expect, it } from 'vitest'
import { Z80, getCpuLanguage } from './index'

describe('Z80 cpu language', () => {
  it('derives the opcode set from the docs keys (no drift)', () => {
    expect(Z80.opcodes.size).toBe(Object.keys(Z80.opcodeDocs).length)
    for (const op of Z80.opcodes) {
      expect(Z80.opcodeDocs[op]).toBeDefined()
    }
    // Spot-check Z80-distinctive mnemonics the 6502 set lacks.
    expect(Z80.opcodes.has('LD')).toBe(true)
    expect(Z80.opcodes.has('LDIR')).toBe(true)
    expect(Z80.opcodes.has('EXX')).toBe(true)
    expect(Z80.opcodes.has('DJNZ')).toBe(true)
    expect(Z80.opcodeDocs.LDIR).toEqual({
      desc: 'Load and increment, repeat (block copy up)',
      flags: 'H P/V N',
    })
  })

  it('resolves the z80 machine cpu to the Z80 vocabulary', () => {
    expect(getCpuLanguage('z80')).toBe(Z80)
    // ...and is distinct from the 6502 set.
    expect(getCpuLanguage('z80')).not.toBe(getCpuLanguage('mos6502'))
  })
})
