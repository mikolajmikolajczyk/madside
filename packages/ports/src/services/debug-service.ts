// DebugService — debugger surface decoupled from any specific CPU. Wraps the
// active DebugAdapterPlugin (M6, v0.6.0) so register/flag names + step /
// breakpoint / memory primitives come from the adapter, not from a hardcoded
// 6502 shape.

import type { DebugAdapterPlugin, DebugTarget } from '../plugin-debug'

/** Generic register snapshot. Keys come from `target()?.registers` ids. */
export type RegState = Record<string, number>

/** Generic flag snapshot. Keys come from `target()?.flags` ids. */
export type FlagState = Record<string, boolean>

export interface DebugService {
  step(): Promise<void>
  stepFrame(): Promise<void>
  /** Single-step instructions until `shouldStop(pc)` returns true (or `max`
   *  instructions elapse), emitting one `debug:step-done` at the end. Powers
   *  source-level "step over": the caller stops at the next address mapped to a
   *  different source line, so no-source library code (cc65 `clrscr` etc) runs
   *  through transparently instead of trapping the user inside it (#49). */
  stepLine(shouldStop: (pc: number) => boolean, max?: number): Promise<void>
  /** Step over the current source line: advance one instruction, then *run*
   *  (frame-stepping, so interrupts are serviced) until the PC reaches one of
   *  `targetAddrs` — the entry addresses of the other source lines — or a user
   *  breakpoint, or `maxFrames` elapse. Unlike `stepLine`'s single-stepping, this
   *  passes through a library call that waits on an interrupt (e.g. a ROM `HALT`
   *  inside `printf`) instead of getting stuck. */
  stepOver(targetAddrs: Iterable<number>, maxFrames?: number): Promise<void>
  setBreakpoint(addr: number): void
  clearBreakpoint(addr: number): void
  breakpoints(): ReadonlySet<number>

  registers(): Promise<RegState>
  flags(): Promise<FlagState>
  /** Read from a named memory space (default: CPU bus). Pass a space id from
   *  `MachinePlugin.memorySpaces` (e.g. 'ppu', 'oam') for a device viewer. */
  readMemory(addr: number, len: number, space?: string): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>

  /** Swap the active DebugAdapterPlugin when the project's machine changes.
   *  Drops the cached DebugTarget so the next target() re-attaches against the
   *  new backend with the new adapter. Breakpoints carry over. */
  setAdapter(adapter: DebugAdapterPlugin): void

  /** The focused CPU id for a multi-CPU machine (Genesis 68000 ↔ Z80). Null /
   *  the primary cpu = the default adapter on the backend; an aux id routes
   *  registers / memory / current-line through that CPU's adapter + the
   *  backend's `auxCpu(id)` view. */
  focusedCpu(): string | null
  /** Focus a CPU by id (null = primary). Drops the cached target so the next
   *  target() re-attaches for the selected CPU. */
  setFocusedCpu(id: string | null): void

  /** Live handle to the attached DebugTarget. Null until RunService.boot()
   *  completes. UI consumers read `target()?.registers` / `target()?.flags`
   *  for the descriptor lists shown in the panel. */
  target(): DebugTarget | null
}
