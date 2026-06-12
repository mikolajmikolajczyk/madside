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
  setBreakpoint(addr: number): void
  clearBreakpoint(addr: number): void
  breakpoints(): ReadonlySet<number>

  registers(): Promise<RegState>
  flags(): Promise<FlagState>
  readMemory(addr: number, len: number): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>

  /** Swap the active DebugAdapterPlugin when the project's machine changes.
   *  Drops the cached DebugTarget so the next target() re-attaches against the
   *  new backend with the new adapter. Breakpoints carry over. */
  setAdapter(adapter: DebugAdapterPlugin): void

  /** Live handle to the attached DebugTarget. Null until RunService.boot()
   *  completes. UI consumers read `target()?.registers` / `target()?.flags`
   *  for the descriptor lists shown in the panel. */
  target(): DebugTarget | null
}
