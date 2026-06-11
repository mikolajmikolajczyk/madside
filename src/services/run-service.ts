import type {
  EmulatorTrapError as EmulatorTrapErrorType,
  EventBus,
  Logger,
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
    if (!backendPromise) backendPromise = deps.backendFactory()
    backend = await backendPromise
    return backend
  }

  return {
    async boot() {
      return ensureBackend()
    },

    async load(binary) {
      try {
        const b = await ensureBackend()
        // EmuBackend exposes loadXEX, not load. Cast through the wider shape
        // — RunBackend doesn't declare loadXEX because once we lift behind a
        // MachinePlugin (M4) the file format becomes per-machine.
        ;(b as RunBackend & { loadXEX(bytes: Uint8Array): void }).loadXEX(binary)
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
