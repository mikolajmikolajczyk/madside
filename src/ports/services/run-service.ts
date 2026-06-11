// RunService — emulator lifecycle. Wraps an EmuBackend today; M4 dispatches
// to the EmulatorPlugin matching the project's MachinePlugin.
//
// The service owns load / run / pause / reset / status + audio. The full
// debug surface (step, breakpoints, registers, memory) is delegated through
// the backend handle exposed by `backend()` until DebugService (M6) wraps it.
// UI loops (Emulator.tsx requestAnimationFrame) call `advanceFrame` directly.

import type { EmulatorTrapError, Result } from '../errors'

export type RunStatus = 'idle' | 'loaded' | 'running' | 'paused' | 'crashed'

/** Minimal facade the UI loops touch directly. RunService delegates here for
 *  per-frame work; DebugService (M6) will tighten this further. */
export interface RunBackend {
  readonly width: number
  readonly height: number
  readonly sampleRate?: number
  readonly pixels: Uint32Array
  advanceFrame(trap?: () => boolean): number
  step(): number
  frameRefresh(): void
  cpuState(): unknown
  getPC(): number
  isAtInstrBoundary(): boolean
  readMem(addr: number, len: number): Uint8Array
  setBreakpoints(addrs: Iterable<number>): void
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers?: number): void
  saveState(): unknown
  loadState(snapshot: unknown): void
}

export interface RunService {
  /** Instantiate the underlying backend without loading a binary. Returns it
   *  ready for frame-loop / video-buffer wiring. Idempotent — repeated calls
   *  return the same backend instance. */
  boot(): Promise<RunBackend>

  load(binary: Uint8Array): Promise<Result<void, EmulatorTrapError>>
  run(): void
  pause(): void
  reset(): void

  readonly status: RunStatus

  startAudio(): Promise<void>
  suspendAudio(): Promise<void>

  /** Synchronous handle — returns the backend if it's been booted, otherwise
   *  null. Escape hatch for the frame loop + (transitionally) the debug
   *  components. DebugService (M6) replaces this with a typed surface. */
  backend(): RunBackend | null
}
