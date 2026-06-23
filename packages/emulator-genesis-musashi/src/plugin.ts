import type { EmulatorPlugin } from '@ports'

// Musashi 68000 core registered as an EmulatorPlugin (#145, Phase A). The backend
// (wasm reactor instantiation) is a separate code-split chunk; createBackend
// lazy-imports it so the 827K core loads only when a Genesis project boots.
export const genesisMusashiEmulator: EmulatorPlugin = {
  id: 'genesis-musashi',
  kind: 'emulator',
  name: 'Musashi (Genesis 68000)',
  createBackend: async () => (await import('./musashi-backend')).createGenesisMusashiBackend(),
}
