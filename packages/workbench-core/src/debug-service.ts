import type {
  DebugAdapterPlugin,
  DebugService,
  DebugTarget,
  EventBus,
  FlagState,
  Logger,
  RegState,
  RunService,
} from '@ports'

// DebugService delegates to the active DebugAdapterPlugin. The adapter wraps
// the RunBackend and exposes a CPU-agnostic surface (descriptors + step + BP
// + memory). DebugService stays adapter-free; createWorkbench injects the
// plugin selected by `manifest.debugAdapter`.

export interface DebugServiceDeps {
  events: EventBus
  run: RunService
  adapter: DebugAdapterPlugin
  logger?: Logger
}

export function createDebugService(deps: DebugServiceDeps): DebugService {
  const log = deps.logger?.child('debug') ?? deps.logger
  const breakpoints = new Set<number>()
  let cachedTarget: DebugTarget | null = null
  let cachedBackendId: object | null = null
  // Mutable so machine selection can swap the adapter without recreating the
  // service (keeps the breakpoint set intact).
  let adapter = deps.adapter

  const target = (): DebugTarget | null => {
    const backend = deps.run.backend()
    if (!backend) {
      cachedTarget = null
      cachedBackendId = null
      return null
    }
    if (backend !== cachedBackendId) {
      cachedTarget = adapter.attach(backend)
      cachedBackendId = backend
    }
    return cachedTarget
  }

  const requireTarget = (): DebugTarget => {
    const t = target()
    if (!t) throw new Error('DebugService called before RunService.boot()')
    return t
  }

  const syncBreakpoints = (): void => {
    target()?.setBreakpoints(breakpoints)
  }

  return {
    async step() {
      const t = requireTarget()
      const pc = await t.step()
      deps.events.emit('debug:step-done', { pc })
    },

    async stepLine(shouldStop, max = 100_000) {
      const t = requireTarget()
      // Single-instruction steps don't trap on breakpoints, so the loop runs
      // straight through library code; we stop when the caller's predicate says
      // we've reached the next source line (or the cap, a hang guard). One
      // step-done at the end keeps the canvas / panels from thrashing per step.
      let pc = 0
      for (let i = 0; i < max; i++) {
        pc = await t.step()
        if (shouldStop(pc)) break
      }
      deps.events.emit('debug:step-done', { pc })
    },

    async stepFrame() {
      const t = requireTarget()
      // Mirror the temporary-disable pattern the JS-side Frame button used
      // (03d7cd5): when paused on a BP, the very first instruction fetch
      // re-trips the BP and the sim halts on iter 1 without producing a
      // frame. Clear → advance → restore so Frame always advances a real
      // display frame regardless of where the user paused. The restored
      // set lets the next Run trap-loop see the user's BPs.
      t.setBreakpoints([])
      try {
        const pc = await t.stepFrame()
        deps.events.emit('debug:step-done', { pc })
      } finally {
        t.setBreakpoints(breakpoints)
      }
    },

    setBreakpoint(addr) {
      breakpoints.add(addr & 0xffff)
      syncBreakpoints()
    },

    clearBreakpoint(addr) {
      breakpoints.delete(addr & 0xffff)
      syncBreakpoints()
    },

    breakpoints() {
      return breakpoints
    },

    async registers(): Promise<RegState> {
      return requireTarget().readRegisters()
    },

    async flags(): Promise<FlagState> {
      return requireTarget().readFlags()
    },

    async readMemory(addr, len, space) {
      return requireTarget().readMemory(addr & 0xffff, len, space)
    },

    async writeMemory(addr, bytes) {
      try {
        await requireTarget().writeMemory(addr & 0xffff, bytes)
      } catch (e) {
        log?.warn('writeMemory rejected by adapter', { addr, len: bytes.length, error: String(e) })
        throw e
      }
    },

    setAdapter(next) {
      adapter = next
      // Force re-attach on next target() — the cached one is bound to the old
      // adapter (and likely a now-unloaded backend).
      cachedTarget = null
      cachedBackendId = null
    },

    target,
  }
}
