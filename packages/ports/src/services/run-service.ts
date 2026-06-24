// RunService — emulator lifecycle. Drives the RunBackend built by the active
// machine's EmulatorPlugin (resolved from the registry in createWorkbench).
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

/** A breakpoint qualified by bank window (ADR-0014, bank-aware debugging). A
 *  bare `number` in `setBreakpoints` is the implicit `cpu` space — today's
 *  behavior verbatim. A banked machine emits this form for code inside a bank
 *  window so the backend fires only when the named bank is live. */
export interface BankBreakpoint {
  /** CPU-bus address the breakpoint sits at (inside a bank window). */
  addr: number
  /** Physical space id, e.g. 'bank3' — the bank the source line was built into
   *  (from the source map's `SourceLoc.space`). */
  space: string
  /** Physical offset within the window's bank domain (`bankIndex*windowSize +
   *  (addr-windowStart)`). The Mesen-style physical key the backend prefers for
   *  the hit-test; computable from the machine's `BankWindow` + `space`. */
  offset: number
}

/** Live projection of one switchable CPU window to its current physical bank
 *  (ADR-0014). The backend reports which bank each `MachinePlugin.banks` window
 *  currently resolves to by reading the live selector register. */
export interface BankProjection {
  /** Window id from `MachinePlugin.banks[].id`. */
  window: string
  /** CPU-bus range the window covers (inclusive). */
  start: number
  end: number
  /** Live space id, e.g. 'bank3' — or null when no ext bank is mapped (gate bit
   *  off / window shows main RAM). */
  space: string | null
  /** Base physical offset of the live bank (`bankIndex*windowSize`); add
   *  `addr-start` for a full offset. null when `space` is null. */
  bankOffset: number | null
}

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
  /** Read `len` bytes at `addr` from a named memory space. `space` defaults to
   *  the CPU bus when omitted; machines with extra address spaces (NES
   *  'ppu'/'oam', C64 'vic', …) declare them in `MachinePlugin.memorySpaces`
   *  and serve them here. Backends throw on an unknown space. */
  readMem(addr: number, len: number, space?: string): Uint8Array
  /** Replace the breakpoint set. A bare `number` is a `cpu`-space breakpoint
   *  (today's behavior verbatim); a {@link BankBreakpoint} fires only when its
   *  bank is live (ADR-0014). Flat backends only ever receive numbers. */
  setBreakpoints(addrs: Iterable<number | BankBreakpoint>): void
  /** Live bank projection per switchable window (ADR-0014). Optional — only
   *  backends for machines that declare `MachinePlugin.banks` implement it; flat
   *  backends omit it. Returns one entry per window. */
  bankMap?(): BankProjection[]
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers?: number): void
  saveState(): unknown
  loadState(snapshot: unknown): void
  /** Start audio output. Lazily creates the AudioContext on first call (needs a
   *  user gesture). RunService calls this on Run. */
  startAudio(): Promise<void>
  /** Stop audio output (pause / stop). */
  suspendAudio(): Promise<void>
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
