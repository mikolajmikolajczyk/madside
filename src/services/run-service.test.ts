// FSM coverage for the Run lifecycle (ADR-0007 + issue 16bf7fd).
//
// Every legal transition must succeed + emit one 'run:state' event with the
// correct { status, prev } payload + notify each subscribe() listener once.
// Every illegal transition must throw without mutating status.

import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from './event-bus'
import { createRunService } from './run-service'
import type { EventBus, RunBackend, RunStatus } from '@ports'

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

function recordEvents(bus: EventBus): Array<{ status: RunStatus; prev: RunStatus }> {
  const seen: Array<{ status: RunStatus; prev: RunStatus }> = []
  bus.on('run:state', (p) => { seen.push({ status: p.status, prev: p.prev }) })
  return seen
}

function setup(backend: RunBackend = fakeBackend()) {
  const events = createEventBus()
  const svc = createRunService({
    events,
    backendFactory: async () => backend,
  })
  const recorded = recordEvents(events)
  return { svc, recorded, events }
}

const binary = new Uint8Array([0x01])

describe('RunService — FSM transitions', () => {
  describe('legal paths', () => {
    it('starts idle', () => {
      const { svc } = setup()
      expect(svc.status).toBe('idle')
    })

    it('idle → loaded via load()', async () => {
      const { svc, recorded } = setup()
      const r = await svc.load(binary)
      expect(r.ok).toBe(true)
      expect(svc.status).toBe('loaded')
      expect(recorded).toEqual([{ status: 'loaded', prev: 'idle' }])
    })

    it('loaded → running via run()', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.run()
      expect(svc.status).toBe('running')
      expect(recorded.at(-1)).toEqual({ status: 'running', prev: 'loaded' })
    })

    it('running → paused via pause()', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.run()
      svc.pause()
      expect(svc.status).toBe('paused')
      expect(recorded.at(-1)).toEqual({ status: 'paused', prev: 'running' })
    })

    it('paused → running via run()', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.run()
      svc.pause()
      svc.run()
      expect(svc.status).toBe('running')
      expect(recorded.at(-1)).toEqual({ status: 'running', prev: 'paused' })
    })

    it('paused → loaded via reset()', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.run()
      svc.pause()
      svc.reset()
      expect(svc.status).toBe('loaded')
      expect(recorded.at(-1)).toEqual({ status: 'loaded', prev: 'paused' })
    })

    it('loaded → idle via unload() (Stop button)', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.unload()
      expect(svc.status).toBe('idle')
      expect(recorded.at(-1)).toEqual({ status: 'idle', prev: 'loaded' })
    })

    it('running → idle via unload()', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      svc.run()
      svc.unload()
      expect(svc.status).toBe('idle')
      expect(recorded.at(-1)).toEqual({ status: 'idle', prev: 'running' })
    })

    it('unload() from idle is quiet', () => {
      const { svc, recorded } = setup()
      svc.unload()
      expect(svc.status).toBe('idle')
      expect(recorded).toEqual([])
    })

    it('crashed → loaded via load() (retry)', async () => {
      let fail = true
      const backend = fakeBackend(() => { if (fail) throw new Error('boom') })
      const { svc, recorded } = setup(backend)
      const r1 = await svc.load(binary)
      expect(r1.ok).toBe(false)
      expect(svc.status).toBe('crashed')
      expect(recorded.at(-1)).toEqual({ status: 'crashed', prev: 'idle' })

      fail = false
      const r2 = await svc.load(binary)
      expect(r2.ok).toBe(true)
      expect(svc.status).toBe('loaded')
      expect(recorded.at(-1)).toEqual({ status: 'loaded', prev: 'crashed' })
    })

    it('same-state transition (loaded → loaded via reset) does not emit', async () => {
      const { svc, recorded } = setup()
      await svc.load(binary)
      recorded.length = 0
      svc.reset()
      expect(svc.status).toBe('loaded')
      expect(recorded).toEqual([])
    })
  })

  describe('illegal transitions throw', () => {
    it('idle → running rejected', () => {
      const { svc } = setup()
      expect(() => svc.run()).toThrowError(/illegal transition idle → running/)
      expect(svc.status).toBe('idle')
    })

    it('idle → paused rejected', () => {
      const { svc } = setup()
      expect(() => svc.pause()).toThrowError(/illegal transition idle → paused/)
      expect(svc.status).toBe('idle')
    })

    it('loaded → paused rejected', async () => {
      const { svc } = setup()
      await svc.load(binary)
      expect(() => svc.pause()).toThrowError(/illegal transition loaded → paused/)
      expect(svc.status).toBe('loaded')
    })
  })

  describe('subscribe()', () => {
    it('notifies on every transition that emits', async () => {
      const { svc } = setup()
      const cb = vi.fn()
      svc.subscribe(cb)
      await svc.load(binary)         // idle → loaded
      svc.run()                      // loaded → running
      svc.pause()                    // running → paused
      expect(cb).toHaveBeenCalledTimes(3)
    })

    it('does not notify on same-state transitions', async () => {
      const { svc } = setup()
      await svc.load(binary)
      const cb = vi.fn()
      svc.subscribe(cb)
      svc.reset()  // loaded → loaded — quiet
      expect(cb).not.toHaveBeenCalled()
    })

    it('returns a disposer that stops further notifications', async () => {
      const { svc } = setup()
      const cb = vi.fn()
      const off = svc.subscribe(cb)
      await svc.load(binary)
      svc.run()
      off()
      svc.pause()
      expect(cb).toHaveBeenCalledTimes(2)
    })

    it('one subscriber throwing does not break the others', async () => {
      const { svc } = setup()
      const cb = vi.fn()
      svc.subscribe(() => { throw new Error('subscriber boom') })
      svc.subscribe(cb)
      await svc.load(binary)
      expect(cb).toHaveBeenCalledTimes(1)
    })
  })

  // Regression: a slow backend boot in flight when the project switches machine
  // (reconfigure) must not clobber the freshly-selected core. Previously the
  // resolved old boot re-assigned `backend`, so the next load() ran on the
  // wrong emulator (Atari core fed an iNES → "unsupported format 'nes'").
  describe('reconfigure during an in-flight boot', () => {
    it('discards the stale boot and loads on the reconfigured backend', async () => {
      const events = createEventBus()
      // Old (Atari-like) backend: its boot is gated so we can interleave a
      // reconfigure before it resolves; rejects the new format if ever used.
      let releaseOld!: () => void
      const oldGate = new Promise<void>((res) => { releaseOld = res })
      const oldBackend = fakeBackend(() => { throw new Error("unsupported format 'nes'") })
      const newBackend = fakeBackend() // accepts the load

      const svc = createRunService({
        events,
        backendFactory: async () => { await oldGate; return oldBackend },
      })

      const booting = svc.boot() // starts the slow old boot, suspends on the gate
      svc.reconfigure({
        backendFactory: async () => newBackend,
        media: { detect: () => 'nes' } as never,
        hardwareConfig: undefined,
      })
      releaseOld() // stale old boot now resolves — must NOT become the backend
      await booting.catch(() => undefined)

      const r = await svc.load(binary)
      expect(r.ok).toBe(true)
      expect(svc.status).toBe('loaded')
    })
  })
})
