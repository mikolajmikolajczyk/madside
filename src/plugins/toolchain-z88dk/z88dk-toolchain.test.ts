import { describe, expect, it } from 'vitest'
import { parseDiagnostics, coerceZ88dkOptions, targetFor } from './z88dk-toolchain'
import { buildSna48k } from './wasm/z88dk-wasm'

describe('z88dk parseDiagnostics', () => {
  it('parses z80asm `file:line: error|warning:` lines (VFS-absolute path → relative)', () => {
    const stderr = ['[z80asm] /src/main.asm:3: error: syntax error', '/src/main.asm:9: warning: foo'].join('\n')
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'src/main.asm', line: 3, severity: 'error', message: 'syntax error' },
      { file: 'src/main.asm', line: 9, severity: 'warning', message: 'foo' },
    ])
  })

  it('reads stdout + stderr and dedupes', () => {
    const line = '/main.asm:1: error: boom'
    expect(parseDiagnostics(line, line)).toHaveLength(1)
  })

  it('ignores non-diagnostic output', () => {
    expect(parseDiagnostics('[z80asm] Assembling...', '')).toEqual([])
  })
})

describe('z88dk coerceZ88dkOptions', () => {
  it('accepts org / snaSp integers + z80asmArgs', () => {
    const r = coerceZ88dkOptions({ org: 0x6000, snaSp: 0xfe00, z80asmArgs: ['-v'] })
    expect(r).toEqual({ ok: true, value: { org: 0x6000, snaSp: 0xfe00, z80asmArgs: ['-v'] } })
  })
  it('rejects out-of-range org', () => {
    expect(coerceZ88dkOptions({ org: 0x1ffff }).ok).toBe(false)
  })
  it('defaults to empty when no options', () => {
    expect(coerceZ88dkOptions(undefined)).toEqual({ ok: true, value: {} })
  })
})

describe('z88dk targetFor', () => {
  it('maps zx-spectrum to +zx and nothing else', () => {
    expect(targetFor('zx-spectrum')).toBe('+zx')
    expect(targetFor('c64')).toBeUndefined()
    expect(targetFor(undefined)).toBeUndefined()
  })
})

describe('z88dk buildSna48k', () => {
  const bin = new Uint8Array([0x3e, 0x02, 0xd3, 0xfe, 0xc9]) // ld a,2 / out(fe),a / ret
  const sna = buildSna48k(bin, 0x8000, 0xff00)

  it('produces a 49179-byte 48K snapshot (what machine-zx.media.detect keys on)', () => {
    expect(sna.length).toBe(49179)
  })
  it('places the binary at org in RAM (0x4000-based)', () => {
    const ramOff = 27 + (0x8000 - 0x4000)
    expect([...sna.slice(ramOff, ramOff + 5)]).toEqual([0x3e, 0x02, 0xd3, 0xfe, 0xc9])
  })
  it('sets SP in the header and pushes the entry PC onto the stack', () => {
    expect(sna[23] | (sna[24] << 8)).toBe(0xff00) // SP
    const spOff = 27 + (0xff00 - 0x4000)
    expect(sna[spOff] | (sna[spOff + 1] << 8)).toBe(0x8000) // pushed PC = org
  })
  it('sets interrupt mode 1', () => {
    expect(sna[25]).toBe(1)
  })
})
