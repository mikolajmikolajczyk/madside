// chips ZX Spectrum core registered as an EmulatorPlugin. The backend (wasm core
// + ROM fetch) is a separate code-split chunk; `createBackend` lazy-imports it so
// the core loads only when a ZX project actually boots — importing this module
// is cheap.

import type { BankWindow, EmulatorPlugin } from '@ports'

export const chipsZxEmulator: EmulatorPlugin = {
  id: 'zx-chips',
  kind: 'emulator',
  name: 'chips (ZX Spectrum)',
  // The machine's bank windows pick 48K vs 128K (ADR-0014): the zx128 machine
  // declares the $C000 window → 128K core; the 48K machine declares none.
  createBackend: async (banks?: readonly BankWindow[]) =>
    (await import('./chips-backend')).createChipsZxBackend(banks),
}
