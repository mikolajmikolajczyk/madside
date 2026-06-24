// DebugAdapter contract (v0.6.0). Detaches the debugger UI from any specific
// CPU/emulator: a DebugTarget describes its register + flag layout up front
// and exposes step / read / breakpoint primitives through which the workbench
// drives debugging. Generic 6502 layout (A/X/Y/PC/SP + N V B D I Z C) ships
// in @plugins/debug-atari-6502 and is reusable for NES (M9).

import type { BankBreakpoint, BankProjection, RunBackend } from './services/run-service'
import type { PluginBase } from './plugin-registry'

export interface RegisterDescriptor {
  /** Stable id consumed by code (e.g. 'a', 'pc', 'sp'). */
  id: string
  /** Display label shown in the debugger panel (e.g. 'A', 'PC'). */
  label: string
  /** Width in bytes — drives hex formatting. */
  width: 1 | 2 | 4
}

export interface FlagDescriptor {
  /** Stable id (e.g. 'n', 'z'). */
  id: string
  /** Display label (e.g. 'N'). */
  label: string
}

/** Per-backend debug surface. Construction is cheap — the adapter typically
 *  closes over a RunBackend handle and forwards calls 1:1. */
export interface DebugTarget {
  readonly registers: readonly RegisterDescriptor[]
  readonly flags: readonly FlagDescriptor[]

  /** Snapshot the register file. Values are integers; widths come from the
   *  descriptor table above. */
  readRegisters(): Promise<Record<string, number>>
  /** Snapshot the flag file. */
  readFlags(): Promise<Record<string, boolean>>

  /** Advance exactly one CPU instruction. Returns the new PC. */
  step(): Promise<number>
  /** Advance one display frame (best-effort). Returns the new PC. */
  stepFrame(): Promise<number>

  /** Replace the breakpoint set. Backends honour the trap on subsequent
   *  advanceFrame() / step() calls. A bare `number` is a `cpu`-space breakpoint
   *  (today's behavior verbatim); a {@link BankBreakpoint} fires only when its
   *  bank is live (ADR-0014). */
  setBreakpoints(addrs: Iterable<number | BankBreakpoint>): void

  /** Live bank projection per switchable CPU window (ADR-0014). Optional —
   *  present only for banked machines; the UI uses it to resolve the current
   *  line's bank and to render the active bank in the memory viewer. */
  bankMap?(): BankProjection[]

  /** Read from a named memory space (default: CPU bus). Machines with extra
   *  address spaces declare them in `MachinePlugin.memorySpaces`; a viewer
   *  panel passes the space id (e.g. 'ppu', 'oam') to read it. */
  readMemory(addr: number, len: number, space?: string): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>

  /** Current PC without snapshotting the whole register file. */
  getPC(): number
  /** True when the backend is paused on an instruction boundary, false when
   *  mid-instruction (some emulators advance in cycle steps). */
  isAtInstrBoundary(): boolean
}

/** DebugAdapter plugin — bridges a generic DebugTarget contract to a specific
 *  emulator backend. PluginRegistry kind: 'debug-adapter'. Manifest dispatch
 *  via `project.json.debugAdapter`. */
export interface DebugAdapterPlugin extends PluginBase {
  readonly kind: 'debug-adapter'
  readonly id: string
  readonly name: string
  /** Build a DebugTarget bound to the supplied backend. Adapter authors keep
   *  this cheap — the workbench may call it once per backend boot. */
  attach(backend: RunBackend): DebugTarget
}
