// RunService — emulator lifecycle. Wraps an EmuBackend today; M4 dispatches
// to the EmulatorPlugin matching the project's MachinePlugin.
//
// The service owns load / run / pause / reset / status + audio. The full
// debug surface (step, breakpoints, registers, memory) is delegated through
// the backend handle exposed by `backend()` until DebugService (M6) wraps it.
// UI loops (Emulator.tsx requestAnimationFrame) call `advanceFrame` directly.

import type { EmulatorTrapError, Result } from '../errors'
import type { Unsubscribe } from '../event-bus'
import type { MachineHardwareConfig, MachineMedia } from '../plugin-machine'

/** Opaque file-format id. Strings come from `MachinePlugin.media.formats` —
 *  the workbench never enumerates them. Atari ships 'xex'/'atr'/'car'/'cas';
 *  NES would ship 'nes'/'fds'; any future machine adds its own without a
 *  port-level change. */
export type EmuMediaFormat = string

export type RunStatus = 'idle' | 'loaded' | 'running' | 'paused' | 'crashed'

/** Minimal facade the UI loops touch directly. RunService delegates here for
 *  per-frame work; DebugService (M6) will tighten this further. */
export interface RunBackend {
  readonly width: number
  readonly height: number
  readonly sampleRate?: number
  readonly pixels: Uint32Array
  /** Single media-load entrypoint. `format` is an opaque id sourced from
   *  `MachinePlugin.media.formats` — the backend decides how to dispatch
   *  internally (Atari-XL's AltirraBackend forwards to per-format
   *  loadXEX/loadATR/loadCAR/loadCAS Embind methods). Backends throw when
   *  asked for a format their emulator can't load. */
  loadMedia(format: string, bytes: Uint8Array): void
  advanceFrame(trap?: () => boolean): number
  step(): number
  cpuState(): unknown
  getPC(): number
  isAtInstrBoundary(): boolean
  readMem(addr: number, len: number): Uint8Array
  setBreakpoints(addrs: Iterable<number>): void
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers?: number): void
  saveState(): unknown
  loadState(snapshot: unknown): void
}

/** Inputs for swapping the active emulator backend when the project's machine
 *  changes (manifest-driven machine selection). Supplied by createWorkbench
 *  from the resolved MachinePlugin + its paired EmulatorPlugin factory. */
export interface RunReconfigure {
  backendFactory: () => Promise<RunBackend>
  media?: MachineMedia
  hardwareConfig?: MachineHardwareConfig
}

export interface RunService {
  /** Instantiate the underlying backend without loading a binary. Returns it
   *  ready for frame-loop / video-buffer wiring. Idempotent — repeated calls
   *  return the same backend instance. */
  boot(): Promise<RunBackend>

  /** Swap the backend factory + media + hardware config for a new machine.
   *  Unloads any booted backend (FSM → idle) and drops the cached instance so
   *  the next boot() builds the new core. No-op-safe to call repeatedly with
   *  the same factory. */
  reconfigure(opts: RunReconfigure): void

  load(binary: Uint8Array, format?: EmuMediaFormat): Promise<Result<void, EmulatorTrapError>>
  run(): void
  pause(): void
  reset(): void
  /** Stop button — drop media + transition to 'idle'. Next load() boots
   *  the binary from scratch. */
  unload(): void

  readonly status: RunStatus

  /** Subscribe to FSM transitions (ADR-0007). Fires after every legal
   *  transition; the listener reads the fresh status via `.status` itself.
   *  Returns the disposer. UI hooks (`useRunStatus`, M7.5 issue d369f2a)
   *  wrap this through `useSyncExternalStore`. */
  subscribe(listener: () => void): Unsubscribe

  startAudio(): Promise<void>
  suspendAudio(): Promise<void>

  /** Synchronous handle — returns the backend if it's been booted, otherwise
   *  null. Escape hatch for the frame loop + (transitionally) the debug
   *  components. DebugService (M6) replaces this with a typed surface. */
  backend(): RunBackend | null
}
