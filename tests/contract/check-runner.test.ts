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
    expect(r.message).toMatch(/\$94.*expected \$00/)
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
