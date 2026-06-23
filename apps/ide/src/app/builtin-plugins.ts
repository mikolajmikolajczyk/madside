import type { PluginBase } from '@ports'
import { atariXl } from '@madside/machine-atari-xl'
import { machineNes } from '@madside/machine-nes'
import { machineC64 } from '@madside/machine-c64'
import { machineZx } from '@madside/machine-zx'
import { machineGenesis } from '@madside/machine-genesis'
import { madsToolchain } from '@madside/toolchain-mads'
import { cc65Toolchain } from '@madside/toolchain-ca65'
import { z88dkToolchain } from '@madside/toolchain-z88dk'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'
import { chipsC64Emulator } from '@madside/emulator-c64-chips'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'
import { genesisMusashiEmulator } from '@madside/emulator-genesis-musashi'
import { altirraEmulator } from '@adapters/emu'
import { atari6502DebugAdapter } from '@madside/debug-atari-6502'
import { zxZ80DebugAdapter } from '@madside/debug-zx-z80'
import { m68kDebugAdapter } from '@madside/debug-m68k'
import { registersPanel } from '@madside/panel-registers'
import { memoryPanel } from '@madside/panel-memory'
import { outputPanel } from '@madside/panel-output'
import { ppuPanel } from '@madside/panel-ppu'
import { variablesPanel } from '@madside/panel-variables'
import { darkTheme } from '@madside/theme-dark'
import { lightTheme } from '@madside/theme-light'

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
  machineGenesis,
  // toolchains
  madsToolchain,
  cc65Toolchain,
  z88dkToolchain,
  clownassemblerToolchain,
  // emulator backends — createBackend lazy-imports its core, so registration
  // stays cheap; machines name the one they run on via `compatibleEmulators`.
  altirraEmulator,
  jsnesEmulator,
  chipsC64Emulator,
  chipsZxEmulator,
  genesisMusashiEmulator,
  // debug adapters
  atari6502DebugAdapter,
  zxZ80DebugAdapter,
  m68kDebugAdapter,
  // panels
  registersPanel,
  memoryPanel,
  outputPanel,
  ppuPanel,
  variablesPanel,
  // themes (#118)
  darkTheme,
  lightTheme,
]
