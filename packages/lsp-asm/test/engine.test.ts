import { describe, expect, it } from 'vitest'
import { createAsmProvider, madsDialect, z80asmDialect, clownassemblerDialect, SEM_LEGEND } from '../src'
import type { SourceFile } from '@madside/lsp-core'

// A small MADS program exercising labels, an equate, and a forward reference to
// an undefined symbol. Offsets are recovered by indexOf in each test.
const MADS = `        org $2000
SCREEN equ $0400
start
        lda #$00
        sta SCREEN
loop
        inc SCREEN
        bne loop
        jmp missing
`

const provider = (files: SourceFile[]) => {
  const p = createAsmProvider(madsDialect)
  p.configure({})
  p.update(files)
  return p
}

describe('asm engine via createAsmProvider (mads)', () => {
  const uri = 'main.asm'
  const files = [{ path: uri, text: MADS }]
  const at = (needle: string, plus = 0) => MADS.indexOf(needle) + plus

  it('go-to-definition: a label reference resolves to its definition', () => {
    const p = provider(files)
    // cursor inside `loop` of `bne loop`
    const def = p.definition(uri, MADS, at('bne loop', 4) + 1)
    expect(def).not.toBeNull()
    expect(def!.uri).toBe(uri)
    // the definition is the bare `loop` label (first occurrence)
    expect(def!.start).toBe(MADS.indexOf('loop'))
  })

  it('find-references: includes the use site and (optionally) the declaration', () => {
    const p = provider(files)
    const defOff = MADS.indexOf('loop')
    const withDecl = p.references(uri, MADS, defOff, true)
    const refOnly = p.references(uri, MADS, defOff, false)
    expect(withDecl.length).toBe(2) // decl + the `bne loop`
    expect(refOnly.length).toBe(1)
    expect(refOnly[0].start).toBe(at('bne loop', 4))
  })

  it('rename: rewrites the definition and every reference', () => {
    const p = provider(files)
    const edits = p.rename(uri, MADS, MADS.indexOf('loop'), 'spin')
    expect(edits.length).toBe(2)
    expect(edits.every((e) => e.newText === 'spin')).toBe(true)
  })

  it('prepareRename refuses opcodes/registers, accepts symbols', () => {
    const p = provider(files)
    expect(p.prepareRename(uri, MADS, at('lda #', 1))).toBeNull() // opcode
    expect(p.prepareRename(uri, MADS, MADS.indexOf('SCREEN'))).not.toBeNull()
  })

  it('hover on an opcode shows description + flags + addressing modes', () => {
    const p = provider(files)
    const h = p.hover(uri, MADS, at('lda #', 1))
    expect(h).toContain('Load A')
    expect(h).toContain('N Z')
    expect(h).toContain('immediate')
    expect(h).toContain('#$nn')
  })

  it('hover on an equate shows its kind + value', () => {
    const p = provider(files)
    const h = p.hover(uri, MADS, at('sta SCREEN', 4) + 1)
    expect(h).toContain('SCREEN')
    expect(h).toContain('equate')
    expect(h).toContain('$0400')
  })

  it('diagnostics flag an undefined symbol', () => {
    const p = provider(files)
    const diags = p.diagnose(uri)
    const undef = diags.find((d) => d.message.includes('missing'))
    expect(undef).toBeTruthy()
    expect(undef!.severity).toBe('warning')
    // SCREEN + loop are defined → not flagged
    expect(diags.some((d) => d.message.includes('SCREEN'))).toBe(false)
  })

  it('document symbols list the definitions', () => {
    const p = provider(files)
    const syms = p.documentSymbols(uri).map((s) => s.name)
    expect(syms).toContain('SCREEN')
    expect(syms).toContain('start')
    expect(syms).toContain('loop')
  })

  it('semantic tokens classify opcode / label / symbol', () => {
    const p = provider(files)
    const toks = p.semanticTokens(uri, MADS)
    const kindAt = (off: number) => {
      const t = toks.find((tk) => tk.start <= off && off < tk.end)
      return t ? SEM_LEGEND[t.tokenType] : undefined
    }
    expect(kindAt(at('lda #', 1))).toBe('opcode')
    expect(kindAt(MADS.indexOf('loop'))).toBe('label')
    expect(kindAt(at('sta SCREEN', 4) + 1)).toBe('symbol')
  })
})

describe('cross-file + case-insensitivity (mads) and z80asm', () => {
  it('resolves a label defined in another file', () => {
    const main = { path: 'main.asm', text: '        jsr draw\n' }
    const lib = { path: 'lib.asm', text: 'draw\n        rts\n' }
    const p = provider([main, lib])
    const def = p.definition('main.asm', main.text, main.text.indexOf('draw') + 1)
    expect(def?.uri).toBe('lib.asm')
  })

  it('folds case for MADS (DRAW resolves draw)', () => {
    const main = { path: 'main.asm', text: '        jsr DRAW\n' }
    const lib = { path: 'lib.asm', text: 'draw\n        rts\n' }
    const p = provider([main, lib])
    expect(p.definition('main.asm', main.text, main.text.indexOf('DRAW') + 1)?.uri).toBe('lib.asm')
  })

  it('addressing-mode validation flags unsupported modes (6502), not valid ones', () => {
    const src = [
      '        lda #$00',   // ok: immediate
      '        jmp #5',     // error: JMP has no immediate
      '        ldx value,x', // error: LDX is Y-indexed, not X
      '        nop #1',     // error: NOP takes no operand
      '        bne done',   // ok: relative
      'value   equ $80',
      'done',
      '        rts',        // ok: implied
    ].join('\n')
    const p = createAsmProvider(madsDialect)
    p.configure({})
    p.update([{ path: 'm.asm', text: src }])
    const errs = p.diagnose('m.asm').filter((d) => d.severity === 'error')
    const msgs = errs.map((e) => e.message)
    expect(msgs.some((m) => m.includes('JMP') && m.includes('immediate'))).toBe(true)
    expect(msgs.some((m) => m.includes('LDX'))).toBe(true)
    expect(msgs.some((m) => m.includes('NOP') && m.includes('no operand'))).toBe(true)
    // valid instructions produce no mode error
    expect(msgs.some((m) => m.includes('LDA'))).toBe(false)
    expect(msgs.some((m) => m.includes('BNE'))).toBe(false)
    expect(msgs.some((m) => m.includes('RTS'))).toBe(false)
  })

  it('z80 dialect does not run addressing-mode validation (forms too varied)', () => {
    const src = '        ld a,(weird+1)\n        push hl\n'
    const p = createAsmProvider(z80asmDialect)
    p.configure({})
    p.update([{ path: 'm.asm', text: src }])
    expect(p.diagnose('m.asm').filter((d) => d.severity === 'error')).toEqual([])
  })

  it('MADS custom mnemonics: pseudo-ops + illegal opcodes recognized, not flagged', () => {
    const src = [
      '        mva #0 dst',        // MADS pseudo-op
      '        sax $80',           // illegal 6502 opcode
      '        jeq loop',          // MADS long conditional jump
      '        boguscall arg',     // unknown mnemonic-slot (a pseudo-op we don\'t model)
      '        lda undefined_sym', // operand-position undefined → SHOULD flag
      'dst     equ $80',
      'loop',
      '        rts',
    ].join('\n')
    const p = createAsmProvider(madsDialect)
    p.configure({})
    p.update([{ path: 'm.asm', text: src }])
    const msgs = p.diagnose('m.asm').map((d) => d.message)
    // recognized as opcodes → not undefined; hover gives the pseudo-op / illegal doc
    expect(msgs.some((m) => m.includes('mva') || m.includes('sax') || m.includes('jeq'))).toBe(false)
    expect(p.hover('m.asm', src, src.indexOf('mva') + 1)).toContain('move byte')
    expect(p.hover('m.asm', src, src.indexOf('sax') + 1)).toContain('Undocumented')
    // unknown mnemonic-slot call is NOT undefined-flagged (likely a pseudo-op)
    expect(msgs.some((m) => m.includes('boguscall'))).toBe(false)
    // ...but a real operand-position undefined symbol still is
    expect(msgs.some((m) => m.includes('undefined_sym'))).toBe(true)
  })

  it('clownassembler (m68k): size suffixes, local labels, registers', () => {
    const src = [
      'Start:',
      '\tlea\tVDP_CTRL,a1',
      '\tmove.w\t#$8000,d0',
      '.regloop:',
      '\tmove.b\t(a0)+,d0',
      '\tdbra\td1,.regloop',
      '\tbra\tStart',
      'VDP_CTRL\tequ\t$C00004',
    ].join('\n')
    const p = createAsmProvider(clownassemblerDialect)
    p.configure({})
    p.update([{ path: 'm.asm', text: src }])

    // size suffix stripped: `move.w` hovers as MOVE, `move.b` too, `lea` as LEA
    expect(p.hover('m.asm', src, src.indexOf('move.w') + 2)).toContain('Move data')
    expect(p.hover('m.asm', src, src.indexOf('lea') + 1)).toContain('effective address')
    // local label `.regloop`: definition + the `dbra d1,.regloop` reference
    const dotOff = src.indexOf('.regloop:') + 2
    expect(p.references('m.asm', src, dotOff, false).length).toBe(1)
    // top-level `Start` referenced by `bra Start`
    expect(p.references('m.asm', src, src.indexOf('Start:'), false).length).toBe(1)
    // equate hover shows the value; registers/opcodes are not flagged undefined
    expect(p.hover('m.asm', src, src.indexOf('VDP_CTRL'))).toContain('$C00004')
    expect(p.diagnose('m.asm').filter((d) => d.message.includes('a1') || d.message.includes('d0'))).toEqual([])
    // no addressing-mode validation for m68k (forms too varied) → no errors
    expect(p.diagnose('m.asm').filter((d) => d.severity === 'error')).toEqual([])
  })

  it('z80asm: BANK_n section labels + defc equates index', () => {
    const src = 'border: equ $fe\nstart:\n        ld a,border\n        jr start\n'
    const p = createAsmProvider(z80asmDialect)
    p.configure({})
    p.update([{ path: 'm.asm', text: src }])
    // `start` referenced by `jr start`
    expect(p.references('m.asm', src, src.indexOf('start'), false).length).toBe(1)
    // `border` equate hover shows value; `ld` is an opcode, not a symbol
    expect(p.hover('m.asm', src, src.indexOf('border'))).toContain('$fe')
    expect(p.hover('m.asm', src, src.indexOf('ld a') + 1)).toContain('Load')
  })
})
