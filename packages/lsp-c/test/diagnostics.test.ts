import { describe, expect, it } from 'vitest'
import { parseBuildOutput } from '../src/engine'

describe('parseBuildOutput', () => {
  it('parses gcc-style file:line:col: error', () => {
    const out = parseBuildOutput('main.c:12:5: error: undefined symbol `foo`')
    expect(out).toEqual([
      { file: 'main.c', line: 12, column: 5, severity: 'error', message: 'undefined symbol `foo`' },
    ])
  })

  it('defaults column to 1 when omitted', () => {
    const out = parseBuildOutput('main.c:7: warning: unused variable `x`')
    expect(out[0]).toMatchObject({ line: 7, column: 1, severity: 'warning' })
  })

  it('maps "fatal error" to error severity', () => {
    const out = parseBuildOutput('a.c:1:1: fatal error: cannot open <stdio.h>')
    expect(out[0]?.severity).toBe('error')
  })

  it('parses cc65 native file(line): Error style', () => {
    const out = parseBuildOutput('src/util.c(34): Error: Expression expected')
    expect(out[0]).toEqual({
      file: 'src/util.c',
      line: 34,
      column: 1,
      severity: 'error',
      message: 'Expression expected',
    })
  })

  it('maps Note to note severity', () => {
    const out = parseBuildOutput('x.c(3): Note: declared here')
    expect(out[0]?.severity).toBe('note')
  })

  it('ignores banner / non-matching lines and parses multiple diagnostics', () => {
    const text = [
      'cc65 v2.19',
      'main.c:2:3: error: first',
      '',
      'main.c:9:1: warning: second',
      'ld65: linking...',
    ].join('\n')
    const out = parseBuildOutput(text)
    expect(out).toHaveLength(2)
    expect(out.map((d) => d.severity)).toEqual(['error', 'warning'])
  })

  it('handles CRLF line endings', () => {
    const out = parseBuildOutput('a.c:1:1: error: one\r\nb.c:2:2: error: two')
    expect(out.map((d) => d.file)).toEqual(['a.c', 'b.c'])
  })
})
