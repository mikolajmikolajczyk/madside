import { describe, expect, it, vi, beforeEach } from 'vitest'
import { parseDiagnostics, coerceZ88dkOptions, targetFor, z88dkToolchain } from './z88dk-toolchain'
import { buildSna48k } from './wasm/z88dk-wasm'
import * as wasm from './wasm/z88dk-wasm'
import type { ToolchainBuildInput } from '@ports'

// Stub the wasm build entry points (they need browser WASI) so build()'s routing
// + diagnostics wiring can be tested as pure logic. buildSna48k stays real.
vi.mock('./wasm/z88dk-wasm', async (importActual) => {
  const actual = await importActual<typeof import('./wasm/z88dk-wasm')>()
  return {
    ...actual,
    buildZ88dk: vi.fn(async () => ({ ok: true, binary: new Uint8Array([0xaa]), stdout: '', stderr: '', exitCode: 0 })),
    buildZ88dkC: vi.fn(async () => ({ ok: true, binary: new Uint8Array([0xbb]), stdout: '', stderr: '', exitCode: 0 })),
  }
})

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

  it('parses sccz80 `file:line:col: [fatal ]error|warning:` (C path, #101)', () => {
    const stderr = [
      'src/main.c:3:11: error: Invalid expression',
      'src/main.c:4:11: warning: Implicit definition of function (nosuchfn)',
      'src/main.c:6:1: fatal error: Expected ;',
    ].join('\n')
    expect(parseDiagnostics('', stderr)).toEqual([
      { file: 'src/main.c', line: 3, severity: 'error', message: 'Invalid expression' },
      { file: 'src/main.c', line: 4, severity: 'warning', message: 'Implicit definition of function (nosuchfn)' },
      { file: 'src/main.c', line: 6, severity: 'error', message: 'Expected ;' },
    ])
  })
})

describe('z88dk build routing (#103)', () => {
  const base = (main: string): ToolchainBuildInput => ({
    projectId: 'p',
    main,
    files: [{ path: main, content: new Uint8Array() }],
    machine: 'zx-spectrum',
  })

  beforeEach(() => {
    vi.mocked(wasm.buildZ88dk).mockClear()
    vi.mocked(wasm.buildZ88dkC).mockClear()
  })

  it('routes a .c entry to the C path', async () => {
    const r = await z88dkToolchain.build(base('src/main.c'))
    expect(wasm.buildZ88dkC).toHaveBeenCalledOnce()
    expect(wasm.buildZ88dk).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
    expect(r.binary).toEqual(new Uint8Array([0xbb]))
  })

  it('routes a .asm entry to the asm path', async () => {
    const r = await z88dkToolchain.build(base('src/main.asm'))
    expect(wasm.buildZ88dk).toHaveBeenCalledOnce()
    expect(wasm.buildZ88dkC).not.toHaveBeenCalled()
    expect(r.binary).toEqual(new Uint8Array([0xaa]))
  })

  it('accepts the zx128 machine and asks the asm path to bank', async () => {
    const r = await z88dkToolchain.build({ ...base('src/main.asm'), machine: 'zx128' })
    expect(r.ok).toBe(true)
    // build(main, files, opts, banked) — the 4th arg is true for zx128.
    expect(vi.mocked(wasm.buildZ88dk).mock.calls[0]![3]).toBe(true)
    // ...and false for the 48K machine.
    await z88dkToolchain.build(base('src/main.asm'))
    expect(vi.mocked(wasm.buildZ88dk).mock.calls[1]![3]).toBe(false)
  })

  it('rejects an unmapped machine before building', async () => {
    const r = await z88dkToolchain.build({ ...base('src/main.c'), machine: 'atari-xl' })
    expect(r.ok).toBe(false)
    expect(r.exitCode).not.toBe(0)
    expect(wasm.buildZ88dkC).not.toHaveBeenCalled()
  })

  it('parses diagnostics from a failed C build (pairs with #101)', async () => {
    vi.mocked(wasm.buildZ88dkC).mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: 'src/main.c:3:11: error: Invalid expression',
      exitCode: 1,
    })
    const r = await z88dkToolchain.build(base('src/main.c'))
    expect(r.ok).toBe(false)
    expect(r.diagnostics).toEqual([
      { file: 'src/main.c', line: 3, severity: 'error', message: 'Invalid expression' },
    ])
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
  it('maps zx-spectrum + zx128 to +zx, nothing else', () => {
    expect(targetFor('zx-spectrum')).toBe('+zx')
    expect(targetFor('zx128')).toBe('+zx')
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
