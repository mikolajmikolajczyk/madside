import type { PluginBase } from '@ports'
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'
import { machineC64 } from '@plugins/machine-c64'
import { machineZx } from '@plugins/machine-zx'
import { madsToolchain } from '@plugins/toolchain-mads'
import { cc65Toolchain } from '@plugins/toolchain-ca65'
import { jsnesEmulator } from '@plugins/emulator-nes-jsnes'
import { chipsC64Emulator } from '@plugins/emulator-c64-chips'
import { chipsZxEmulator } from '@plugins/emulator-zx-chips'
import { altirraEmulator } from '@adapters/emu'
import { atari6502DebugAdapter } from '@plugins/debug-atari-6502'
import { registersPanel } from '@plugins/panel-registers'
import { memoryPanel } from '@plugins/panel-memory'
import { outputPanel } from '@plugins/panel-output'
import { ppuPanel } from '@plugins/panel-ppu'

// Built-in plugin manifest (#67). Single source of truth for the bundled
// (`origin: 'builtin'`) plugins the workbench registers at bootstrap. Adding a
// machine / toolchain / emulator / debug adapter / panel = one line here;
// `createWorkbench` stays composition-only and registers the whole list in a
// loop instead of accreting a register() call per capability.
//
// NOT here: converters + editors. They have a different lifecycle
// (project-local, per-file, content-addressed JS loaded on demand by extension)
// and use their own dedicated loaders rather than the PluginRegistry. See
// wiki/decisions/2026-06-16-plugin-registry-vs-dedicated-loaders.md.
export const builtinPlugins: readonly PluginBase[] = [
  // machines
  atariXl,
  machineNes,
  machineC64,
  machineZx,
  // toolchains
  madsToolchain,
  cc65Toolchain,
  // emulator backends — createBackend lazy-imports its core, so registration
  // stays cheap; machines name the one they run on via `compatibleEmulators`.
  altirraEmulator,
  jsnesEmulator,
  chipsC64Emulator,
  chipsZxEmulator,
  // debug adapters
  atari6502DebugAdapter,
  // panels
  registersPanel,
  memoryPanel,
  outputPanel,
  ppuPanel,
]
