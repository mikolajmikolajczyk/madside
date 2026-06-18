import { describe, expect, it } from 'vitest'
import { parseDiagnostics } from './ca65-toolchain'

describe('cc65 parseDiagnostics', () => {
  it('parses cc65/ca65/ld65 error + warning lines (tagged by the runner)', () => {
    const stderr = [
      '[cc65] main.c(13): Error: Undefined symbol: `_foo\'',
      '[ca65] src/start.s(4): Warning: Suspicious address expression',
    ].join('\n')
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'main.c', line: 13, severity: 'error', message: "Undefined symbol: `_foo'" },
      { file: 'src/start.s', line: 4, severity: 'warning', message: 'Suspicious address expression' },
    ])
  })

  it('reads both stdout and stderr and dedupes', () => {
    const line = '[cc65] main.c(1): Error: boom'
    const diags = parseDiagnostics(line, line)
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({ file: 'main.c', line: 1, severity: 'error' })
  })

  it('parses cc65 gcc-style `file:line:` format (the C compiler)', () => {
    const stderr = '[cc65] src/main.c:14: Error: Unknown type name \'in\''
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'src/main.c', line: 14, severity: 'error', message: "Unknown type name 'in'" },
    ])
  })

  it('parses a `file:line:col:` form', () => {
    const diags = parseDiagnostics('', 'src/main.c:14:7: Error: boom')
    expect(diags[0]).toMatchObject({ file: 'src/main.c', line: 14, severity: 'error' })
  })

  it('strips ANSI colour codes before parsing', () => {
    const stderr = '\x1b[97mruntime/callmain.s:27: \x1b[93mWarning:\x1b[97m Unresolved external\x1b[0m'
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'runtime/callmain.s', line: 27, severity: 'warning', message: 'Unresolved external' },
    ])
  })

  it('parses an unprefixed continuation line (2nd+ error of a block)', () => {
    const stderr = ['[cc65] src/main.c:5: Error: first', 'src/main.c:9: Error: second'].join('\n')
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'src/main.c', line: 5, severity: 'error', message: 'first' },
      { file: 'src/main.c', line: 9, severity: 'error', message: 'second' },
    ])
  })

  it('ignores non-diagnostic output', () => {
    expect(parseDiagnostics('[ld65] linking...', '')).toEqual([])
  })
})
