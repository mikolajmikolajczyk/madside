// ADR-0007 property fuzz: random sequences of FSM moves never desync the
// service's `status` field, the `subscribe()` snapshot a `useSyncExternalStore`
// consumer would read, and the last `run:state` event payload.
//
// Belt-and-suspenders on top of run-service-events.test.ts. The exact contract
// covers each transition individually; this layer mashes them together at
// random and catches "two transitions race, snapshot lags an event" classes
// of regression. fcdc6d5.

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createEventBus } from '@services/event-bus'
import { createRunService, type RunBackendFactory } from '@services/run-service'
import type { RunBackend, RunStatus } from '@ports'

type Move =
  | { op: 'load'; willThrow: boolean }
  | { op: 'run' }
  | { op: 'pause' }
  | { op: 'reset' }
  | { op: 'unload' }

const LEGAL_NEXT: Record<RunStatus, ReadonlySet<RunStatus>> = {
  idle:    new Set<RunStatus>(['loaded', 'crashed']),
  loaded:  new Set<RunStatus>(['running', 'loaded', 'crashed', 'idle']),
  running: new Set<RunStatus>(['paused', 'loaded', 'crashed', 'idle']),
  paused:  new Set<RunStatus>(['running', 'loaded', 'crashed', 'idle']),
  crashed: new Set<RunStatus>(['loaded', 'crashed', 'idle']),
}

function backendFactory(loadShouldThrowRef: { current: boolean }): RunBackendFactory {
  const backend: RunBackend = {
    width: 1, height: 1, pixels: new Uint32Array(1),
    loadMedia: () => { if (loadShouldThrowRef.current) throw new Error('boom') },
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
  }
  return async () => backend
}

const bin = new Uint8Array([1])

const moveArb = fc.oneof(
  fc.record({ op: fc.constant('load' as const), willThrow: fc.boolean() }),
  fc.record({ op: fc.constant('run' as const) }),
  fc.record({ op: fc.constant('pause' as const) }),
  fc.record({ op: fc.constant('reset' as const) }),
  fc.record({ op: fc.constant('unload' as const) }),
)

describe('RunService property fuzz — FSM status, subscribe snapshot, and last event never desync', () => {
  it('100 random move sequences hold the invariant', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(moveArb, { minLength: 1, maxLength: 30 }), async (moves: Move[]) => {
        const events = createEventBus()
        const throwRef = { current: false }
        const svc = createRunService({ events, backendFactory: backendFactory(throwRef) })

        let lastEvent: { status: RunStatus; prev: RunStatus } | null = null
        events.on('run:state', (p) => { lastEvent = p })

        let snapshot: RunStatus = svc.status
        const off = svc.subscribe(() => { snapshot = svc.status })

        try {
          for (const m of moves) {
            const prev = svc.status
            const expectedAfter = nextStatus(prev, m)

            try {
              if (m.op === 'load') {
                throwRef.current = m.willThrow
                await svc.load(bin)
              } else if (m.op === 'run') svc.run()
              else if (m.op === 'pause') svc.pause()
              else if (m.op === 'reset') svc.reset()
              else svc.unload()
            } catch {
              expect(LEGAL_NEXT[prev].has(expectedAfter ?? prev)).toBe(false)
              expect(svc.status).toBe(prev)
              expect(snapshot).toBe(prev)
              continue
            }

            expect(svc.status).toBe(expectedAfter)
            expect(snapshot).toBe(svc.status)
            if (prev !== svc.status) {
              expect(lastEvent).toEqual({ status: svc.status, prev })
            }
          }
        } finally {
          off()
        }
      }),
      { numRuns: 100 },
    )
  })
})

function nextStatus(prev: RunStatus, m: Move): RunStatus {
  if (m.op === 'load') return m.willThrow ? 'crashed' : 'loaded'
  if (m.op === 'run') return 'running'
  if (m.op === 'pause') return 'paused'
  if (m.op === 'reset') return prev === 'idle' ? 'idle' : 'loaded'
  // ^ reset no-ops from idle (no armed FSM); from any other state it goes to loaded.
  return 'idle'
}
