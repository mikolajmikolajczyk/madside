// ADR-0007 wire contract: every legal Run FSM transition emits exactly one
// 'run:state' event with the expected { status, prev } payload. Every illegal
// transition throws without leaking spurious events.
//
// Driven against a fake backend so the contract is exercised without booting
// Altirra. Pattern reusable for DebugService / AssetPipelineService when
// those formalise their own FSMs.

import { describe, expect, it } from 'vitest'
import { assertExactlyOneEvent, assertNoEvent } from '@ports/test'
import { createEventBus } from '@services/event-bus'
import { createRunService, type RunBackendFactory } from '@services/run-service'
import type { EventBus, RunBackend, RunService, RunStatus } from '@ports'

function fakeBackend(loadOverride?: () => void): RunBackend {
  return {
    width: 1,
    height: 1,
    pixels: new Uint32Array(1),
    loadMedia: loadOverride ?? (() => undefined),
    advanceFrame: () => 0,
    step: () => 0,
    cpuState: () => ({}),
    getPC: () => 0,
    isAtInstrBoundary: () => true,
    readMem: () => new Uint8Array(),
    setBreakpoints: () => undefined,
    sendKey: () => undefined,
    saveState: () => null,
    loadState: () => undefined,
    startAudio: async () => {},
    suspendAudio: async () => {},
  }
}

function setup(backendFactory?: RunBackendFactory): { svc: RunService; events: EventBus } {
  const events = createEventBus()
  const svc = createRunService({
    events,
    backendFactory: backendFactory ?? (async () => fakeBackend()),
  })
  return { svc, events }
}

const subscribe = (events: EventBus) =>
  (handler: (p: { status: RunStatus; prev: RunStatus }) => void) =>
    events.on('run:state', handler)

const bin = new Uint8Array([1])

describe('RunService wire contract — every legal transition emits exactly one event', () => {
  it('idle → loaded via load()', async () => {
    const { svc, events } = setup()
    const payload = await assertExactlyOneEvent(subscribe(events), async () => {
      await svc.load(bin)
    })
    expect(payload).toEqual({ status: 'loaded', prev: 'idle' })
  })

  it('idle → crashed via load() (backend throws)', async () => {
    const backend = fakeBackend(() => { throw new Error('boom') })
    const { svc, events } = setup(async () => backend)
    const payload = await assertExactlyOneEvent(subscribe(events), async () => {
      await svc.load(bin)
    })
    expect(payload).toEqual({ status: 'crashed', prev: 'idle' })
  })

  it('loaded → running via run()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.run() })
    expect(payload).toEqual({ status: 'running', prev: 'loaded' })
  })

  it('loaded → idle via unload()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.unload() })
    expect(payload).toEqual({ status: 'idle', prev: 'loaded' })
  })

  it('running → paused via pause()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.pause() })
    expect(payload).toEqual({ status: 'paused', prev: 'running' })
  })

  it('running → idle via unload()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.unload() })
    expect(payload).toEqual({ status: 'idle', prev: 'running' })
  })

  it('paused → running via run() (Continue)', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    svc.pause()
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.run() })
    expect(payload).toEqual({ status: 'running', prev: 'paused' })
  })

  it('paused → loaded via reset()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    svc.pause()
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.reset() })
    expect(payload).toEqual({ status: 'loaded', prev: 'paused' })
  })

  it('paused → idle via unload()', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    svc.pause()
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.unload() })
    expect(payload).toEqual({ status: 'idle', prev: 'paused' })
  })

  it('crashed → loaded via load() (retry succeeds)', async () => {
    let fail = true
    const backend = fakeBackend(() => { if (fail) throw new Error('boom') })
    const { svc, events } = setup(async () => backend)
    await svc.load(bin)
    fail = false
    const payload = await assertExactlyOneEvent(subscribe(events), async () => {
      await svc.load(bin)
    })
    expect(payload).toEqual({ status: 'loaded', prev: 'crashed' })
  })

  it('crashed → idle via unload()', async () => {
    const backend = fakeBackend(() => { throw new Error('boom') })
    const { svc, events } = setup(async () => backend)
    await svc.load(bin)
    const payload = await assertExactlyOneEvent(subscribe(events), () => { svc.unload() })
    expect(payload).toEqual({ status: 'idle', prev: 'crashed' })
  })
})

describe('RunService wire contract — same-state transitions are quiet', () => {
  it('loaded → loaded via reset() emits nothing', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    await assertNoEvent(subscribe(events), () => { svc.reset() })
  })

  it('unload() from idle emits nothing', async () => {
    const { svc, events } = setup()
    await assertNoEvent(subscribe(events), () => { svc.unload() })
  })
})

describe('RunService wire contract — illegal transitions throw without leaking events', () => {
  it('idle → running rejected, no event', async () => {
    const { svc, events } = setup()
    await assertNoEvent(subscribe(events), () => {
      expect(() => svc.run()).toThrow(/illegal transition idle → running/)
    })
    expect(svc.status).toBe('idle')
  })

  it('idle → paused rejected, no event', async () => {
    const { svc, events } = setup()
    await assertNoEvent(subscribe(events), () => {
      expect(() => svc.pause()).toThrow(/illegal transition idle → paused/)
    })
    expect(svc.status).toBe('idle')
  })

  it('loaded → paused rejected, no event', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    await assertNoEvent(subscribe(events), () => {
      expect(() => svc.pause()).toThrow(/illegal transition loaded → paused/)
    })
    expect(svc.status).toBe('loaded')
  })

  it('running → idle via run() (illegal — must go through pause or unload)', async () => {
    const { svc, events } = setup()
    await svc.load(bin)
    svc.run()
    // running → running same-state is technically reachable but the call is
    // not idempotent — run() always throws when called on the current state.
    await assertNoEvent(subscribe(events), () => {
      expect(() => svc.run()).toThrow(/illegal transition running → running/)
    })
    expect(svc.status).toBe('running')
  })
})
