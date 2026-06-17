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

  it('ignores non-diagnostic output', () => {
    expect(parseDiagnostics('[ld65] linking...', '')).toEqual([])
  })
})
