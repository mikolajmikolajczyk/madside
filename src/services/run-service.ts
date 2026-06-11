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
} from '@ports'
import { EmulatorTrapError, err, ok } from '@ports'

// RunService wraps an EmuBackend created on first load(). Status transitions
// emit 'run:state' on the workbench EventBus. Backend instantiation is async
// so we serialize creation per service instance.
//
// Adapter wiring: @app injects a `backendFactory` that returns a Promise of
// the concrete EmuBackend (today: AltirraBackend). The service stays
// adapter-free per ADR-0002.

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

export function createRunService(deps: RunServiceDeps): RunService {
  const log = deps.logger?.child('run') ?? deps.logger
  let backend: RunBackend | null = null
  let backendPromise: Promise<RunBackend> | null = null
  let status: RunStatus = 'idle'

  const setStatus = (next: RunStatus): void => {
    if (status === next) return
    status = next
    deps.events.emit('run:state', { status })
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
        setStatus('loaded')
        return ok(undefined)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'load failed'
        log?.error('emu load threw', cause)
        setStatus('crashed')
        const e: EmulatorTrapErrorType = new EmulatorTrapError(message, undefined, cause)
        return err(e)
      }
    },

    run() {
      if (status === 'crashed' || status === 'idle') return
      setStatus('running')
    },

    pause() {
      if (status !== 'running') return
      setStatus('paused')
    },

    reset() {
      if (!backend) return
      backend.frameRefresh()
      backend.cpuState()
      // Soft pattern: reset is delegated to the backend's reset path on next
      // load — for explicit reset we currently re-load the binary at the UI
      // layer. M4 lifts this behind the MachinePlugin.
      setStatus('loaded')
    },

    get status() {
      return status
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
