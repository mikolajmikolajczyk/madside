export type { CpuRegs, EmuBackend } from './backend'
// Altirra is exposed as an EmulatorPlugin (registered + resolved via the
// PluginRegistry). createEmu stays internal — reached only through the plugin's
// lazy createBackend, which keeps the wasm core code-split.
export { altirraEmulator } from './emulator'
