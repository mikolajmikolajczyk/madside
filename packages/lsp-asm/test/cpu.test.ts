import { describe, expect, it } from 'vitest'
import {
  MOS6502,
  Z80,
  getCpuOpcodes,
  getAsmDialect,
  ASM_DIALECTS,
  madsDialect,
  ca65Dialect,
  z80asmDialect,
} from '../src'

describe('cpu opcode-hint tables', () => {
  it('derives the mnemonic set from the info keys (no drift)', () => {
    expect(MOS6502.mnemonics.has('LDA')).toBe(true)
    expect(MOS6502.mnemonics.size).toBe(Object.keys(MOS6502.info).length)
    expect(Z80.mnemonics.has('LDIR')).toBe(true)
  })

  it('carries description + flags + addressing modes for 6502 LDA', () => {
    const lda = MOS6502.info.LDA
    expect(lda.desc).toMatch(/load a/i)
    expect(lda.flags).toBe('N Z')
    // The killer feature: which addressing modes the opcode accepts.
    const modes = lda.modes.map((m) => m.mode)
    expect(modes).toContain('immediate')
    expect(modes).toContain('zeropage,X')
    expect(modes).toContain('(indirect),Y')
    // Each mode carries an operand syntax template + encoded length.
    const imm = lda.modes.find((m) => m.mode === 'immediate')!
    expect(imm.syntax).toBe('#$nn')
    expect(imm.bytes).toBe(2)
  })

  it('models implied vs operand opcodes distinctly (6502)', () => {
    expect(MOS6502.info.NOP.modes).toEqual([{ mode: 'implied', syntax: '', bytes: 1 }])
    expect(MOS6502.info.JMP.modes.map((m) => m.mode)).toEqual(['absolute', 'indirect'])
  })

  it('carries operand forms for z80 LD + ALU group', () => {
    const ld = Z80.info.LD
    expect(ld.modes.some((m) => m.syntax === 'r,r')).toBe(true)
    expect(ld.modes.some((m) => m.syntax.includes('(IX+d)'))).toBe(true)
    // ALU group shares the A,r / A,n / A,(HL) forms.
    expect(Z80.info.ADD.modes.some((m) => m.syntax === 'A,r')).toBe(true)
    expect(Z80.info.XOR.flags).toBe('S Z H P/V N C')
  })

  it('resolves cpu tables by machine cpu id', () => {
    expect(getCpuOpcodes('mos6502')).toBe(MOS6502)
    expect(getCpuOpcodes('ricoh-2a03')).toBe(MOS6502) // NES 2A03
    expect(getCpuOpcodes('mos6510')).toBe(MOS6502) // C64
    expect(getCpuOpcodes('z80')).toBe(Z80)
    expect(getCpuOpcodes('m68000')?.info.MOVE.desc).toMatch(/move/i) // Genesis 68000
    expect(getCpuOpcodes('unknown')).toBeUndefined()
  })
})

describe('asm dialect profiles', () => {
  it('registers mads / ca65 / z80asm / clownassembler', () => {
    expect(ASM_DIALECTS.sort()).toEqual(['ca65', 'clownassembler', 'mads', 'z80asm'])
    expect(getAsmDialect('mads')).toBe(madsDialect)
    expect(getAsmDialect('clownassembler')?.cpu.mnemonics.has('MOVE')).toBe(true)
    expect(getAsmDialect('nope')).toBeUndefined()
  })

  it('binds each dialect to its CPU table', () => {
    expect(madsDialect.cpu).toBe(MOS6502)
    expect(ca65Dialect.cpu).toBe(MOS6502)
    expect(z80asmDialect.cpu).toBe(Z80)
  })

  it('captures dialect-specific syntax (label/include/equate)', () => {
    // ca65: dotted directives, colon labels, .include
    expect(ca65Dialect.directivePrefix).toBe('.')
    expect(ca65Dialect.labelColon).toBe(true)
    expect('.include "zp.inc"'.match(ca65Dialect.include)?.[1]).toBe('zp.inc')
    // mads: bare directives, case-insensitive, icl includes, EQU equates
    expect(madsDialect.caseInsensitive).toBe(true)
    expect('        icl "macros.a65"'.match(madsDialect.include)?.[1]).toBe('macros.a65')
    expect('SCREEN equ $0400'.match(madsDialect.equate)?.[1]).toBe('SCREEN')
    // z80asm: defc + equ equates
    expect('defc border = $fe'.match(z80asmDialect.equate)?.[1]).toBe('border')
    expect('delay: equ 1000'.match(z80asmDialect.equate)?.[1]).toBe('delay')
  })
})
