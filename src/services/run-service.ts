import type {
  EmuMediaFormat,
  EmulatorTrapError as EmulatorTrapErrorType,
  EventBus,
  Logger,
  RunBackend,
  RunService,
  RunStatus,
} from '@ports'
import { EmulatorTrapError, err, ok } from '@ports'

/** Detect media format from leading magic bytes. Falls back to 'xex' which
 *  has the loosest format (any binary). */
function detectFormat(bytes: Uint8Array): EmuMediaFormat {
  if (bytes.length >= 2) {
    // ATR header magic: 0x96 0x02
    if (bytes[0] === 0x96 && bytes[1] === 0x02) return 'atr'
  }
  if (bytes.length >= 4) {
    const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
    if (tag === 'CART') return 'car'
    if (tag === 'FUJI') return 'cas'
  }
  return 'xex'
}

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

    async load(binary, format) {
      try {
        const b = await ensureBackend()
        const fmt = format ?? detectFormat(binary)
        const loader =
          fmt === 'atr' ? b.loadATR :
          fmt === 'car' ? b.loadCAR :
          fmt === 'cas' ? b.loadCAS :
          b.loadXEX
        if (!loader) throw new Error(`backend has no loader for ${fmt}`)
        loader.call(b, binary)
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
