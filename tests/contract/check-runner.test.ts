import { describe, expect, it } from 'vitest'
import type { CourseCheck } from '@app/courses'
import {
  evaluateCheck,
  evaluateChecks,
  memKey,
  parseBytes,
  parseNum,
  runChecks,
  type CheckContext,
  type CheckRunDeps,
} from '@app/check-runner'

// Declarative check runner (29540fd). The pure evaluator is tested directly
// against materialised contexts; the orchestrator with injected fakes.

describe('parse helpers', () => {
  it('parses hex and decimal literals', () => {
    expect(parseNum('$94')).toBe(0x94)
    expect(parseNum('0x02C6')).toBe(0x02c6)
    expect(parseNum('148')).toBe(148)
  })
  it('parses byte sequences', () => {
    expect(parseBytes('$94')).toEqual([0x94])
    expect(parseBytes('$94 $12, 3')).toEqual([0x94, 0x12, 3])
  })
})

const baseCtx = (over: Partial<CheckContext> = {}): CheckContext => ({
  build: { ok: true },
  labels: new Map(),
  ...over,
})

describe('evaluateCheck — build', () => {
  it('passes on a clean build', () => {
    expect(evaluateCheck({ kind: 'build' }, baseCtx()).pass).toBe(true)
  })
  it('fails with the build error', () => {
    const r = evaluateCheck({ kind: 'build' }, baseCtx({ build: { ok: false, error: 'syntax error line 4' } }))
    expect(r.pass).toBe(false)
    expect(r.message).toMatch(/syntax error/)
  })
})

describe('evaluateCheck — label', () => {
  const ctx = baseCtx({ labels: new Map([['start', 0x2000]]) })
  it('passes when the label exists', () => {
    expect(evaluateCheck({ kind: 'label', name: 'start' }, ctx).pass).toBe(true)
  })
  it('fails when the label is missing', () => {
    expect(evaluateCheck({ kind: 'label', name: 'nope' }, ctx).pass).toBe(false)
  })
  it('matches an expected address', () => {
    expect(evaluateCheck({ kind: 'label', name: 'start', addr: '$2000' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'label', name: 'start', addr: '$3000' }, ctx).pass).toBe(false)
  })
  it('matches case-insensitively (MADS uppercases its symbol table)', () => {
    const upper = baseCtx({ labels: new Map([['START', 0x2000]]) })
    expect(evaluateCheck({ kind: 'label', name: 'start' }, upper).pass).toBe(true)
    expect(evaluateCheck({ kind: 'label', name: 'start', addr: '$2000' }, upper).pass).toBe(true)
  })
})

describe('evaluateCheck — register', () => {
  const ctx = baseCtx({ regs: { a: 0x94, x: 0, y: 0, pc: 0x2010, sp: 0xff } })
  it('passes on a matching register', () => {
    expect(evaluateCheck({ kind: 'register', reg: 'a', equals: '$94' }, ctx).pass).toBe(true)
  })
  it('fails on a mismatch and reports both values', () => {
    const r = evaluateCheck({ kind: 'register', reg: 'a', equals: '$00' }, ctx)
    expect(r.pass).toBe(false)
    expect(r.message).toMatch(/\$94.*expected = \$00/)
  })
  it('fails when no register snapshot is present', () => {
    expect(evaluateCheck({ kind: 'register', reg: 'a', equals: '$94' }, baseCtx()).pass).toBe(false)
  })
})

describe('evaluateCheck — memory', () => {
  const mem = new Map([[memKey(0x02c6, 1), new Uint8Array([0x94])]])
  const ctx = baseCtx({ mem })
  it('passes on a matching byte', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$02C6', equals: '$94' }, ctx).pass).toBe(true)
  })
  it('fails on a mismatch', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$02C6', equals: '$00' }, ctx).pass).toBe(false)
  })
  it('fails when the region was not read', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$0080', equals: '$94' }, ctx).pass).toBe(false)
  })
  it('compares a multi-byte sequence in order (e.g. a sorted result)', () => {
    const seq = new Map([[memKey(0x3000, 5), Uint8Array.from([0x01, 0x02, 0x03, 0x05, 0x08])]])
    const c = baseCtx({ mem: seq })
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$01 $02 $03 $05 $08' }, c).pass).toBe(true)
    // wrong order fails
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$01 $02 $03 $08 $05' }, c).pass).toBe(false)
    // ne = the sequence is not exactly this
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', op: 'ne', equals: '$00 $00 $00 $00 $00' }, c).pass).toBe(true)
  })
})

describe('evaluateCheck — comparison operators', () => {
  const regs = { a: 0x10, x: 0, y: 0, pc: 0x2010, sp: 0xff }
  const ctx = baseCtx({ regs, mem: new Map([[memKey(0x02c6, 1), new Uint8Array([0x10])], [memKey(0x80, 2), new Uint8Array([0x00, 0x02])]]) })

  it('register: ne / gt / lt / ge / le', () => {
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'ne', equals: '$00' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'ne', equals: '$10' }, ctx).pass).toBe(false)
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'gt', equals: '$0F' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'lt', equals: '$10' }, ctx).pass).toBe(false)
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'ge', equals: '$10' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'register', reg: 'a', op: 'le', equals: '$10' }, ctx).pass).toBe(true)
  })
  it('register: op defaults to eq when omitted', () => {
    expect(evaluateCheck({ kind: 'register', reg: 'a', equals: '$10' }, ctx).pass).toBe(true)
  })
  it('register: fail message shows the operator symbol', () => {
    const r = evaluateCheck({ kind: 'register', reg: 'a', op: 'gt', equals: '$20' }, ctx)
    expect(r.message).toMatch(/expected > \$20/)
  })
  it('memory: ne on a byte sequence', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$02C6', op: 'ne', equals: '$00' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'memory', addr: '$02C6', op: 'ne', equals: '$10' }, ctx).pass).toBe(false)
  })
  it('memory: gt/lt take a multi-byte read little-endian', () => {
    // [$00,$02] little-endian = $0200 = 512
    expect(evaluateCheck({ kind: 'memory', addr: '$0080', op: 'gt', equals: '$00 $01' }, ctx).pass).toBe(true) // 512 > 256
    expect(evaluateCheck({ kind: 'memory', addr: '$0080', op: 'lt', equals: '$00 $01' }, ctx).pass).toBe(false)
  })
})

describe('evaluateCheck — memory range/fill (count)', () => {
  const fill = new Uint8Array(16).fill(0xaa)
  const mixed = Uint8Array.from([0xaa, 0xaa, 0x00, 0xaa])
  const ctx = baseCtx({ mem: new Map([[memKey(0x3000, 16), fill], [memKey(0x3000, 4), mixed]]) })

  it('passes when every byte in the range equals the value', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$AA', count: 16 }, ctx).pass).toBe(true)
  })
  it('fails and points at the first offending byte', () => {
    const r = evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$AA', count: 4 }, ctx)
    expect(r.pass).toBe(false)
    expect(r.message).toMatch(/\$3002 = \$00/) // third byte is wrong
  })
  it('honours the operator across the range (ne = every byte differs)', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$00', op: 'ne', count: 16 }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'memory', addr: '$3000', equals: '$AA', op: 'ne', count: 16 }, ctx).pass).toBe(false)
  })
})

describe('evaluateCheck — indirect (pointer follow)', () => {
  // SAVMSC ($58) holds $9C40; the screen at $9C40 spells screen-codes 8 5 12 12 15.
  const ctx = baseCtx({ mem: new Map<string, Uint8Array>([
    [memKey(0x58, 2), Uint8Array.from([0x40, 0x9c])],       // pointer, little-endian
    [memKey(0x9c40, 5), Uint8Array.from([8, 5, 12, 12, 15])], // *(ptr)
    [memKey(0x9c42, 1), Uint8Array.from([12])],              // *(ptr)+2
  ]) })

  it('dereferences the pointer and compares the target sequence', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$58', indirect: true, equals: '$08 $05 $0C $0C $0F' }, ctx).pass).toBe(true)
    expect(evaluateCheck({ kind: 'memory', addr: '$58', indirect: true, equals: '$00 $00' }, ctx).pass).toBe(false)
  })
  it('applies the offset (the ,y)', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$58', indirect: true, offset: 2, equals: '$0C' }, ctx).pass).toBe(true)
  })
  it('reports when the pointer itself was not read', () => {
    expect(evaluateCheck({ kind: 'memory', addr: '$60', indirect: true, equals: '$00' }, ctx).message).toMatch(/pointer not read/)
  })
  it('labels the check with the indirect form', () => {
    const r = evaluateCheck({ kind: 'memory', addr: '$58', indirect: true, offset: 2, equals: '$00' }, ctx)
    expect(r.label).toMatch(/\*\(\$58\)\+2/)
  })
})

describe('runChecks — indirect memory read', () => {
  it('reads the pointer then the target it points to', async () => {
    const reads: [number, number][] = []
    const report = await runChecks(
      [{ kind: 'memory', addr: '$58', indirect: true, offset: 1, equals: '$05' }],
      {
        assemble: async () => ({ ok: true, labels: new Map(), binary: new Uint8Array([1]) }),
        run: async () => ({
          regs: {},
          readMem: (addr, len) => {
            reads.push([addr, len])
            if (addr === 0x58) return Uint8Array.from([0x40, 0x9c]) // pointer -> $9C40
            return Uint8Array.from([0x05]) // target byte at $9C41
          },
        }),
      },
    )
    expect(reads).toContainEqual([0x58, 2])     // pointer read
    expect(reads).toContainEqual([0x9c41, 1])   // target = $9C40 + offset 1
    expect(report.pass).toBe(true)
  })
})

describe('evaluateCheck — unparseable value', () => {
  it('reports the bad value instead of NaN (label addr)', () => {
    const ctx = baseCtx({ labels: new Map([['hue', 0xcb]]) })
    const r = evaluateCheck({ kind: 'label', name: 'hue', addr: 'CB' }, ctx)
    expect(r.pass).toBe(false)
    expect(r.message).toMatch(/not a number/)
    expect(r.message).not.toMatch(/NaN/)
  })
  it('reports the bad value for register/memory', () => {
    const ctx = baseCtx({ regs: { a: 1, x: 0, y: 0, pc: 0, sp: 0 }, mem: new Map([[memKey(0x80, 1), new Uint8Array([1])]]) })
    expect(evaluateCheck({ kind: 'register', reg: 'a', equals: 'ZZ' }, ctx).message).toMatch(/not a number/)
    expect(evaluateCheck({ kind: 'memory', addr: 'GG', equals: '$01' }, ctx).message).toMatch(/not a number/)
    expect(evaluateCheck({ kind: 'memory', addr: '$0080', equals: 'ZZ' }, ctx).message).toMatch(/not a number/)
  })
})

describe('evaluateChecks', () => {
  it('passes only when every assertion passes', () => {
    const checks: CourseCheck[] = [{ kind: 'build' }, { kind: 'label', name: 'start' }]
    const ctx = baseCtx({ labels: new Map([['start', 0x2000]]) })
    expect(evaluateChecks(checks, ctx).pass).toBe(true)
    expect(evaluateChecks([...checks, { kind: 'label', name: 'gone' }], ctx).pass).toBe(false)
  })
})

describe('runChecks — orchestration', () => {
  const goodDeps = (over: Partial<CheckRunDeps> = {}): CheckRunDeps => ({
    assemble: async () => ({ ok: true, labels: new Map([['start', 0x2000]]), binary: new Uint8Array([1, 2, 3]) }),
    run: async () => ({ regs: { a: 0x94 }, readMem: () => new Uint8Array([0x94]) }),
    ...over,
  })

  it('does not run the emulator for build/label-only checks', async () => {
    let ran = false
    const report = await runChecks([{ kind: 'build' }, { kind: 'label', name: 'start' }], goodDeps({
      run: async () => { ran = true; return { regs: {}, readMem: () => new Uint8Array() } },
    }))
    expect(ran).toBe(false)
    expect(report.pass).toBe(true)
  })

  it('runs and reads register/memory for run-dependent checks', async () => {
    const report = await runChecks(
      [{ kind: 'register', reg: 'a', equals: '$94' }, { kind: 'memory', addr: '$02C6', equals: '$94', afterFrames: 2 }],
      goodDeps(),
    )
    expect(report.pass).toBe(true)
    expect(report.results).toHaveLength(2)
  })

  it('advances to the max afterFrames across checks', async () => {
    let asked = -1
    await runChecks(
      [{ kind: 'memory', addr: '$00', equals: '$94', afterFrames: 2 }, { kind: 'register', reg: 'a', equals: '$94', afterFrames: 5 }],
      goodDeps({ run: async (_b, frames) => { asked = frames; return { regs: { a: 0x94 }, readMem: () => new Uint8Array([0x94]) } } }),
    )
    expect(asked).toBe(5)
  })

  it('short-circuits register/memory when the build fails', async () => {
    const report = await runChecks([{ kind: 'build' }, { kind: 'register', reg: 'a', equals: '$94' }], goodDeps({
      assemble: async () => ({ ok: false, error: 'boom', labels: new Map() }),
    }))
    expect(report.pass).toBe(false)
    expect(report.results[0]!.message).toMatch(/boom/)
    expect(report.results[1]!.pass).toBe(false) // not run → unavailable
  })

  it('reports a run failure without throwing', async () => {
    const report = await runChecks([{ kind: 'register', reg: 'a', equals: '$94' }], goodDeps({
      run: async () => { throw new Error('emu crashed') },
    }))
    expect(report.pass).toBe(false)
    expect(report.results[0]!.message).toMatch(/emu crashed/)
  })
})
