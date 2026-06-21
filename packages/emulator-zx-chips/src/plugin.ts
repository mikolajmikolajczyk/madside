// chips ZX Spectrum core registered as an EmulatorPlugin. The backend (wasm core
// + ROM fetch) is a separate code-split chunk; `createBackend` lazy-imports it so
// the core loads only when a ZX project actually boots — importing this module
// is cheap.

import type { EmulatorPlugin } from '@ports'

export const chipsZxEmulator: EmulatorPlugin = {
  id: 'zx-chips',
  kind: 'emulator',
  name: 'chips (ZX Spectrum)',
  createBackend: async () => (await import('./chips-backend')).createChipsZxBackend(),
}
