// RunService — emulator lifecycle. Wraps EmuBackend today; M4 dispatches to
// the EmulatorPlugin matching the project's MachinePlugin.

import type { EmulatorTrapError, Result } from '../errors'

export type RunStatus = 'idle' | 'loaded' | 'running' | 'paused' | 'crashed'

export interface RunService {
  load(binary: Uint8Array): Promise<Result<void, EmulatorTrapError>>
  run(): void
  pause(): void
  reset(): void

  readonly status: RunStatus

  startAudio(): Promise<void>
  suspendAudio(): Promise<void>
}
