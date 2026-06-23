import { describe, expect, it, vi } from 'vitest'
import { createDebugService, createEventBus } from '@madside/workbench-core'
import type { DebugAdapterPlugin, DebugTarget, RunBackend, RunService } from '@ports'

// Direct DebugService unit test (ADR-0005 Layer-2). nes-bp.test.ts drives the
// backend straight; this drives the *service*, with a fake adapter + backend so
// we can observe the address masking, the stepFrame clear→advance→restore dance,
// adapter swapping, and backend-identity re-attach without booting an emulator.

interface FakeTarget extends DebugTarget {
  /** Every setBreakpoints() call, captured as a plain sorted array. */
  bpCalls: number[][]
  stepFrameImpl: () => Promise<number>
}

function fakeTarget(): FakeTarget {
  const bpCalls: number[][] = []
  const t: FakeTarget = {
    registers: [],
    flags: [],
    bpCalls,
    stepFrameImpl: async () => 0x1234,
    async readRegisters() { return {} },
    async readFlags() { return {} },
    async step() { return 0xaaaa },
    stepFrame() { return t.stepFrameImpl() },
    setBreakpoints(addrs) { bpCalls.push([...addrs].sort((a, b) => a - b)) },
    readMemory: vi.fn(async () => new Uint8Array()),
    writeMemory: vi.fn(async () => {}),
    getPC: () => 0,
    isAtInstrBoundary: () => true,
  }
  return t
}

function fakeAdapter(target: FakeTarget, id = 'fake') {
  const attach = vi.fn((): DebugTarget => target)
  const plugin: DebugAdapterPlugin = { id, name: id, attach }
  return { plugin, attach }
}

/** Minimal RunService — DebugService only ever calls .backend(). */
function fakeRun(backend: RunBackend | null) {
  let current = backend
  const run = { backend: () => current } as unknown as RunService
  return { run, setBackend: (b: RunBackend | null) => { current = b } }
}

// A backend is just an identity token to DebugService (passed to adapter.attach).
const backendToken = (): RunBackend => ({} as RunBackend)

function setup(backend: RunBackend | null = backendToken()) {
  const events = createEventBus()
  const target = fakeTarget()
  const { plugin, attach } = fakeAdapter(target)
  const { run, setBackend } = fakeRun(backend)
  const svc = createDebugService({ events, run, adapter: plugin })
  return { svc, events, target, attach, setBackend }
}

describe('DebugService', () => {
  it('keeps breakpoint addresses at native width (#133/88A — no 16-bit mask)', () => {
    const { svc, target } = setup()
    svc.setBreakpoint(0x10005) // a >64K address (e.g. 68000) survives intact
    expect([...svc.breakpoints()]).toEqual([0x10005])
    expect(target.bpCalls.at(-1)).toEqual([0x10005])
  })

  it('clearBreakpoint removes the exact (unmasked) address — no 16-bit aliasing', () => {
    const { svc } = setup()
    svc.setBreakpoint(0x10005)
    svc.clearBreakpoint(0x0005) // would have aliased under masking; must not now
    expect([...svc.breakpoints()]).toEqual([0x10005])
    svc.clearBreakpoint(0x10005)
    expect([...svc.breakpoints()]).toEqual([])
  })

  it('stepFrame clears the BP set, advances, then restores it', async () => {
    const { svc, events, target } = setup()
    const steps: number[] = []
    events.on('debug:step-done', (p) => steps.push(p.pc))
    svc.setBreakpoint(7)
    target.bpCalls.length = 0 // ignore the setBreakpoint sync; watch only stepFrame
    await svc.stepFrame()
    // clear (empty) immediately followed by restore (the user's set)
    expect(target.bpCalls).toEqual([[], [7]])
    expect(steps).toEqual([0x1234])
  })

  it('stepFrame restores breakpoints even when the advance throws', async () => {
    const { svc, target } = setup()
    svc.setBreakpoint(7)
    target.bpCalls.length = 0
    target.stepFrameImpl = async () => { throw new Error('frame boom') }
    await expect(svc.stepFrame()).rejects.toThrow('frame boom')
    // cleared, then restored via finally — last call is the user's set
    expect(target.bpCalls).toEqual([[], [7]])
  })

  it('setAdapter forces a re-attach on the next call with the new adapter', async () => {
    const { svc, attach } = setup()
    await svc.registers()            // attaches adapter A once
    expect(attach).toHaveBeenCalledTimes(1)

    const next = fakeTarget()
    const b = fakeAdapter(next, 'other')
    svc.setAdapter(b.plugin)
    await svc.registers()            // must attach the new adapter
    expect(b.attach).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledTimes(1) // old adapter not re-touched
  })

  it('re-attaches when the backend identity changes', async () => {
    const { svc, attach, setBackend } = setup()
    await svc.registers()
    await svc.registers()
    expect(attach).toHaveBeenCalledTimes(1) // cached on stable backend

    setBackend(backendToken())             // new backend object
    await svc.registers()
    expect(attach).toHaveBeenCalledTimes(2)
  })

  it('throws when used before the backend boots', async () => {
    const { svc } = setup(null)
    await expect(svc.registers()).rejects.toThrow(/before RunService\.boot/)
  })

  it('passes readMemory addresses through at native width + space (#133/88A)', async () => {
    const { svc, target } = setup()
    await svc.readMemory(0x10003, 4, 'cpu')
    expect(target.readMemory).toHaveBeenCalledWith(0x10003, 4, 'cpu')
  })
})
