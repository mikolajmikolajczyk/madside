import type {
  AuxCpuView,
  DebugAdapterPlugin,
  DebugService,
  DebugTarget,
  EventBus,
  FlagState,
  Logger,
  RegState,
  RunBackend,
  RunService,
} from '@ports'

// Present a backend's secondary-CPU view (registers/PC/memory) as a RunBackend so
// an existing DebugAdapter can attach to it. Control (step/run/breakpoints) stays
// on the REAL backend — stepping the machine advances every CPU together — only
// the CPU-state reads come from the aux view.
function auxBackend(real: RunBackend, view: AuxCpuView): RunBackend {
  return {
    width: real.width,
    height: real.height,
    sampleRate: real.sampleRate,
    pixels: real.pixels,
    loadMedia: (f, b) => real.loadMedia(f, b),
    advanceFrame: (t) => real.advanceFrame(t),
    step: () => real.step(),
    cpuState: () => view.cpuState(),
    getPC: () => view.getPC(),
    isAtInstrBoundary: () => real.isAtInstrBoundary(),
    readMem: (a, l, s) => view.readMem(a, l, s),
    setBreakpoints: (a) => (view.setBreakpoints ? view.setBreakpoints(a) : real.setBreakpoints(a)),
    bankMap: view.bankMap ? () => view.bankMap!() : real.bankMap ? () => real.bankMap!() : undefined,
    sendKey: (k, c, d, m) => real.sendKey(k, c, d, m),
    saveState: () => real.saveState(),
    loadState: (s) => real.loadState(s),
    startAudio: () => real.startAudio(),
    suspendAudio: () => real.suspendAudio(),
  }
}

// DebugService delegates to the active DebugAdapterPlugin. The adapter wraps
// the RunBackend and exposes a CPU-agnostic surface (descriptors + step + BP
// + memory). DebugService stays adapter-free; createWorkbench injects the
// plugin selected by `manifest.debugAdapter`.

export interface DebugServiceDeps {
  events: EventBus
  run: RunService
  adapter: DebugAdapterPlugin
  /** Per-aux-cpu DebugAdapters for multi-CPU machines (Genesis: `{ z80: zxZ80 }`).
   *  The focused-CPU switch attaches these to the backend's `auxCpu(id)` view. */
  auxAdapters?: Record<string, DebugAdapterPlugin>
  logger?: Logger
}

export function createDebugService(deps: DebugServiceDeps): DebugService {
  const log = deps.logger?.child('debug') ?? deps.logger
  const breakpoints = new Set<number>()
  let cachedTarget: DebugTarget | null = null
  let cachedBackendId: object | null = null
  let cachedCpuId: string | null = null
  // Mutable so machine selection can swap the adapter without recreating the
  // service (keeps the breakpoint set intact).
  let adapter = deps.adapter
  // Focused CPU for a multi-CPU machine (null = primary). Routes target() to the
  // aux adapter + the backend's auxCpu(id) view.
  let focusedCpuId: string | null = null

  const attachFor = (backend: RunBackend, cpuId: string | null): DebugTarget => {
    if (cpuId) {
      const auxAdapter = deps.auxAdapters?.[cpuId]
      const view = backend.auxCpu?.(cpuId)
      if (auxAdapter && view) return auxAdapter.attach(auxBackend(backend, view))
    }
    return adapter.attach(backend)
  }

  const target = (): DebugTarget | null => {
    const backend = deps.run.backend()
    if (!backend) {
      cachedTarget = null
      cachedBackendId = null
      return null
    }
    if (backend !== cachedBackendId || focusedCpuId !== cachedCpuId) {
      cachedTarget = attachFor(backend, focusedCpuId)
      cachedBackendId = backend
      cachedCpuId = focusedCpuId
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
      // Addresses flow at native width (ADR-0011, #133/88A) — no 16-bit mask, so
      // a >64K/24-bit target works; current ≤64K machines are unaffected (their
      // addresses are already ≤0xffff).
      breakpoints.add(addr)
      syncBreakpoints()
    },

    clearBreakpoint(addr) {
      breakpoints.delete(addr)
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
      // Native-width address + the optional space dimension (ADR-0011, #133).
      return requireTarget().readMemory(addr, len, space)
    },

    async writeMemory(addr, bytes) {
      try {
        await requireTarget().writeMemory(addr, bytes)
      } catch (e) {
        log?.warn('writeMemory rejected by adapter', { addr, len: bytes.length, error: String(e) })
        throw e
      }
    },

    setAdapter(next) {
      adapter = next
      // Force re-attach on next target() — the cached one is bound to the old
      // adapter (and likely a now-unloaded backend). Reset the focus to the new
      // machine's primary CPU.
      focusedCpuId = null
      cachedTarget = null
      cachedBackendId = null
      cachedCpuId = null
    },

    focusedCpu() {
      return focusedCpuId
    },

    setFocusedCpu(id) {
      if (id === focusedCpuId) return
      focusedCpuId = id
      // target() re-attaches because focusedCpuId !== cachedCpuId; re-apply the
      // (shared) breakpoint set to the newly focused CPU's target.
      syncBreakpoints()
      // Nudge the debug panels to re-read registers/memory through the new focus.
      deps.events.emit('debug:step-done', { pc: target()?.getPC() ?? 0 })
    },

    target,
  }
}
