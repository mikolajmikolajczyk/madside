import type {
  DebugService,
  EventBus,
  FlagState,
  Logger,
  RegState,
  RunBackend,
  RunService,
} from '@ports'

// DebugService wraps the RunBackend debug surface (step / BP / registers /
// memory) and broadcasts step / bp-hit events on the workbench EventBus. The
// concrete backend comes from RunService — this service stays adapter-free.
//
// Hot-loop paths (Emulator.tsx requestAnimationFrame, the 60-fps blit) keep
// using RunService.backend() directly. DebugService is the surface debug
// panels + breakpoint hooks talk to.

export interface DebugServiceDeps {
  events: EventBus
  run: RunService
  logger?: Logger
}

export function createDebugService(deps: DebugServiceDeps): DebugService {
  const log = deps.logger?.child('debug') ?? deps.logger
  const breakpoints = new Set<number>()

  const requireBackend = (): RunBackend => {
    const b = deps.run.backend()
    if (!b) throw new Error('DebugService called before RunService.boot()')
    return b
  }

  const syncBreakpoints = (): void => {
    const b = deps.run.backend()
    if (b) b.setBreakpoints(breakpoints)
  }

  return {
    async step() {
      const b = requireBackend()
      b.step()
      deps.events.emit('debug:step-done', { pc: b.getPC() })
    },

    async stepFrame() {
      const b = requireBackend()
      b.advanceFrame()
      deps.events.emit('debug:step-done', { pc: b.getPC() })
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
      const b = requireBackend()
      const cpu = b.cpuState() as { a: number; x: number; y: number; pc: number; sp: number }
      return { a: cpu.a, x: cpu.x, y: cpu.y, pc: cpu.pc, sp: cpu.sp }
    },

    async flags(): Promise<FlagState> {
      const b = requireBackend()
      const cpu = b.cpuState() as { flags: FlagState }
      return cpu.flags
    },

    async readMemory(addr, len) {
      const b = requireBackend()
      return b.readMem(addr & 0xffff, len)
    },

    writeMemory: async () => {
      // RunBackend doesn't expose memory writes today (M6 DebugAdapter does).
      log?.warn('writeMemory not implemented')
      throw new Error('writeMemory not implemented in v0.3.0')
    },
  }
}
