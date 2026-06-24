// EmulatorPlugin contract. Wraps an emulator core (Altirra wasm, jsnes, …)
// behind the `RunBackend` the RunService drives, so backends register and
// resolve through the PluginRegistry like every other plugin kind instead of
// being hard-wired in createWorkbench. A MachinePlugin names the emulator(s)
// that can host it via `compatibleEmulators`.

import type { PluginBase } from './plugin-registry'
import type { BankWindow } from './plugin-machine'
import type { RunBackend } from './services/run-service'

export interface EmulatorPlugin extends PluginBase {
  readonly kind: 'emulator'
  readonly id: string
  readonly name: string
  /** Build a fresh backend instance. Async so the heavy core (a wasm fetch or
   *  a code-split chunk) loads only when an emulator is actually selected.
   *  `banks` carries the active machine's switchable bank windows (ADR-0014)
   *  so the backend can implement `bankMap()`; the app layer supplies it
   *  (adapters can't import machine plugins). Omitted / ignored for flat
   *  machines. */
  createBackend(banks?: readonly BankWindow[]): Promise<RunBackend>
}
