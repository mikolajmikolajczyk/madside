import type {
  EmuMediaFormat,
  EmulatorTrapError as EmulatorTrapErrorType,
  EventBus,
  Logger,
  MachineHardwareConfig,
  MachineMedia,
  RunBackend,
  RunService,
  RunStatus,
  Unsubscribe,
} from '@ports'
import { EmulatorTrapError, err, ok } from '@ports'

// RunService — Run lifecycle FSM (ADR-0007).
//
// Legal transitions:
//   idle    → loaded                      (via load)
//   idle    → crashed                     (load threw before media stuck)
//   loaded  → running                     (via run)
//   loaded  → loaded                      (via reset / re-load — no-op event)
//   loaded  → crashed                     (load on top of loaded threw)
//   loaded  → idle                        (via unload — Stop button)
//   running → paused                      (via pause / bp-hit handled by caller)
//   running → loaded                      (via load / reset — re-arm)
//   running → crashed                     (load mid-run threw)
//   running → idle                        (via unload)
//   paused  → running                     (via run)
//   paused  → loaded                      (via load / reset)
//   paused  → crashed                     (load while paused threw)
//   paused  → idle                        (via unload)
//   crashed → loaded                      (via load — retry)
//   crashed → crashed                     (load retry threw again)
//   crashed → idle                        (via unload — give up on retry)
//
// Each successful transition fires `run:state` with `{ status, prev }` and
// notifies internal subscribers (useSyncExternalStore consumers).
// Illegal transitions throw so the bug surfaces at the call site instead of
// going silent.

export type RunBackendFactory = () => Promise<RunBackend>

export interface RunServiceDeps {
  events: EventBus
  backendFactory: RunBackendFactory
  logger?: Logger
  /** Applied to the backend on first boot. Comes from the active MachinePlugin
   *  in @app/createWorkbench. */
  hardwareConfig?: MachineHardwareConfig
  /** Machine-driven format detection / dispatch table. RunService.load uses
   *  it to resolve the format id; backend.loadMedia takes it from there. */
  media?: MachineMedia
}

const LEGAL_NEXT: Record<RunStatus, ReadonlySet<RunStatus>> = {
  idle:    new Set<RunStatus>(['loaded', 'crashed']),
  loaded:  new Set<RunStatus>(['running', 'loaded', 'crashed', 'idle']),
  running: new Set<RunStatus>(['paused', 'loaded', 'crashed', 'idle']),
  paused:  new Set<RunStatus>(['running', 'loaded', 'crashed', 'idle']),
  crashed: new Set<RunStatus>(['loaded', 'crashed', 'idle']),
}

export function createRunService(deps: RunServiceDeps): RunService {
  const log = deps.logger?.child('run') ?? deps.logger
  let backend: RunBackend | null = null
  let backendPromise: Promise<RunBackend> | null = null
  let status: RunStatus = 'idle'
  const subscribers = new Set<() => void>()

  // FSM driver. Throws on illegal transition (ADR-0007 — surface the bug
  // at the call site instead of silently no-op'ing). Same-state transitions
  // (loaded → loaded after reset, crashed → crashed after retry-fail) are
  // listed as legal but do not fire events; observers stay quiescent.
  const transitionTo = (next: RunStatus, source: string): void => {
    const allowed = LEGAL_NEXT[status]
    if (!allowed.has(next)) {
      throw new Error(
        `RunService: illegal transition ${status} → ${next} (source: ${source})`,
      )
    }
    if (status === next) return
    const prev = status
    status = next
    deps.events.emit('run:state', { status, prev })
    for (const fn of subscribers) {
      try {
        fn()
      } catch (e) {
        log?.warn('RunService subscriber threw', { error: String(e) })
      }
    }
  }

  const ensureBackend = async (): Promise<RunBackend> => {
    if (backend) return backend
    if (!backendPromise) {
      backendPromise = (async () => {
        const b = await deps.backendFactory()
        // Apply MachinePlugin hardware config before any load — Altirra's
        // setters take effect on the next ColdReset (which loadXEX et al.
        // trigger).
        const hw = deps.hardwareConfig
        if (hw) {
          const wb = b as RunBackend & {
            setHardwareMode?(n: number): void
            setMemoryMode?(n: number): void
            setBasic?(b: boolean): void
            setKernel?(n: number): void
          }
          if (hw.hardwareMode !== undefined) wb.setHardwareMode?.(hw.hardwareMode)
          if (hw.memoryMode !== undefined)   wb.setMemoryMode?.(hw.memoryMode)
          if (hw.basic !== undefined)        wb.setBasic?.(hw.basic)
          if (hw.kernel !== undefined)       wb.setKernel?.(hw.kernel)
        }
        return b
      })()
    }
    backend = await backendPromise
    return backend
  }

  return {
    async boot() {
      return ensureBackend()
    },

    async load(binary, format) {
      try {
        const b = await ensureBackend()
        // Resolve format: explicit caller hint wins, then MachinePlugin
        // magic detection, then MachinePlugin defaultFormat. Workbench has
        // no Atari knowledge — it just dispatches the resolved string.
        const fmt: EmuMediaFormat = format
          ?? deps.media?.detect(binary)
          ?? deps.media?.defaultFormat
          ?? 'binary'
        b.loadMedia(fmt, binary)
        transitionTo('loaded', 'load')
        return ok(undefined)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'load failed'
        log?.error('emu load threw', cause)
        transitionTo('crashed', 'load')
        const e: EmulatorTrapErrorType = new EmulatorTrapError(message, undefined, cause)
        return err(e)
      }
    },

    run() {
      transitionTo('running', 'run')
    },

    pause() {
      transitionTo('paused', 'pause')
    },

    reset() {
      if (!backend) return
      // Soft pattern: reset is delegated to the backend's reset path on next
      // load — for explicit reset the UI re-loads the binary. EmulatorPlugin
      // (M4 follow-up) folds this into a typed lifecycle method. Same-state
      // 'loaded → loaded' is legal-but-quiet.
      transitionTo('loaded', 'reset')
    },

    unload() {
      // Stop button: drop the media + transition back to 'idle'. Next Run
      // re-loads the binary from scratch.
      if (status === 'idle') return
      transitionTo('idle', 'unload')
    },

    get status() {
      return status
    },

    subscribe(listener: () => void): Unsubscribe {
      subscribers.add(listener)
      return () => { subscribers.delete(listener) }
    },

    async startAudio() {
      if (!backend) return
      await (backend as RunBackend & { startAudio(): Promise<void> }).startAudio()
    },

    async suspendAudio() {
      if (!backend) return
      await (backend as RunBackend & { suspendAudio(): Promise<void> }).suspendAudio()
    },

    backend() {
      return backend
    },
  }
}
