import type { EmulatorPlugin } from '@ports'

// Genesis Plus GX registered as an EmulatorPlugin (#145, Phase B) — the full
// Sega Mega Drive (VDP + YM2612/PSG + Z80 + I/O). The backend (wasm reactor
// instantiation, ~2.6 MB core) is a separate code-split chunk; createBackend
// lazy-imports it so the core loads only when a Genesis project boots.
export const genesisGpgxEmulator: EmulatorPlugin = {
  id: 'genesis-gpgx',
  kind: 'emulator',
  name: 'Genesis Plus GX (Sega Mega Drive)',
  createBackend: async () => (await import('./gpgx-backend')).createGenesisGpgxBackend(),
}
