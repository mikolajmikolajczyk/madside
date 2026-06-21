import { describe, expect, it } from 'vitest'
import { parseMadsDiagnostics } from './diagnostics'

describe('parseMadsDiagnostics', () => {
  it('parses a MADS error line into a structured diagnostic', () => {
    const diags = parseMadsDiagnostics('main.a65 (12) ERROR: Undeclared label A\n', '')
    expect(diags).toEqual([
      { file: 'main.a65', line: 12, severity: 'error', message: 'Undeclared label A' },
    ])
  })

  it('parses warnings and nested paths', () => {
    const diags = parseMadsDiagnostics('lib/util.a65 (5) WARNING: branch out of range\n', '')
    expect(diags).toEqual([
      { file: 'lib/util.a65', line: 5, severity: 'warning', message: 'branch out of range' },
    ])
  })

  it('reads both stdout and stderr', () => {
    const diags = parseMadsDiagnostics('a.a65 (1) ERROR: x', 'b.a65 (2) WARNING: y')
    expect(diags.map((d) => d.file)).toEqual(['a.a65', 'b.a65'])
  })

  it('dedupes diagnostics repeated across passes', () => {
    const text = 'main.a65 (12) ERROR: Undeclared label A'
    const diags = parseMadsDiagnostics(`${text}\n${text}`, '')
    expect(diags).toHaveLength(1)
  })

  it('ignores lines that are not diagnostics', () => {
    const diags = parseMadsDiagnostics('Mad-Assembler 2.1.0\nWriting xex...\n', '')
    expect(diags).toEqual([])
  })
})
