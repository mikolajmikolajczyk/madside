import { describe, expect, it } from 'vitest'
import { MOS6502 } from '@core'
import { madsToolchain } from '@plugins/toolchain-mads'
import { reservedWords, scanFileLabels } from '@app/labels'
import type { LabelInfo } from '@core'

// Editor-language generalization (epic 78b12bf) — the data side. The CPU
// supplies opcodes; the toolchain supplies directives/snippets; the label
// scanner skips both via the shared reserved-word set.

describe('toolchain language + label reserved words', () => {
  it('MADS provides directives, comments, and snippets', () => {
    const lang = madsToolchain.language
    expect(lang).toBeDefined()
    expect(lang!.directives).toContain('ORG')
    expect(lang!.directives).toContain('DTA')
    expect(lang!.lineComment).toEqual([';', '//'])
    expect(lang!.snippets?.some((s) => s.label === 'program')).toBe(true)
  })

  it('reservedWords unions CPU opcodes + toolchain directives (uppercase)', () => {
    const reserved = reservedWords(MOS6502, madsToolchain.language!)
    expect(reserved.has('LDA')).toBe(true) // 6502 opcode
    expect(reserved.has('ORG')).toBe(true) // MADS directive
    expect(reserved.has('START')).toBe(false) // a user label
  })

  it('label scanner skips reserved words, keeps user labels', () => {
    const reserved = reservedWords(MOS6502, madsToolchain.language!)
    const out = new Map<string, LabelInfo>()
    scanFileLabels('start\n        lda #0\norg $2000\nloop\n        jmp loop\n', 'src/main.a65', out, reserved)
    expect(out.has('start')).toBe(true)
    expect(out.has('loop')).toBe(true)
    expect(out.has('lda')).toBe(false) // opcode (column 0 here, but reserved)
    expect(out.has('org')).toBe(false) // directive
  })
})
