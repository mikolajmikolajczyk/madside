// chips C64 core registered as an EmulatorPlugin. The backend (wasm core + ROM
// fetch) is a separate code-split chunk; `createBackend` lazy-imports it so the
// core loads only when a C64 project actually boots — importing this module is
// cheap.

import type { EmulatorPlugin } from '@ports'

export const chipsC64Emulator: EmulatorPlugin = {
  id: 'chips-c64',
  kind: 'emulator',
  name: 'chips (C64)',
  createBackend: async () => (await import('./chips-backend')).createChipsC64Backend(),
}
