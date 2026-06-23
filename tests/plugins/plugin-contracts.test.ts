import { describe, it } from 'vitest'
import {
  assertConverterPlugin,
  assertDebugAdapterPlugin,
  assertEditorPlugin,
  assertMachinePlugin,
  assertPanelPlugin,
} from '@ports/test'
import { atariXl } from '@madside/machine-atari-xl'
import { machineNes } from '@madside/machine-nes'
import { machineC64 } from '@madside/machine-c64'
import { machineZx } from '@madside/machine-zx'
import { registersPanel } from '@madside/panel-registers'
import { memoryPanel } from '@madside/panel-memory'
import { outputPanel } from '@madside/panel-output'
import { ppuPanel } from '@madside/panel-ppu'
import { variablesPanel } from '@madside/panel-variables'
import { atari6502DebugAdapter } from '@madside/debug-atari-6502'
import { zxZ80DebugAdapter } from '@madside/debug-zx-z80'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'
import { listBuiltins } from '@madside/converters'
import { listBuiltinEditors } from '@madside/editors'

// Every built-in plugin runs through its kind's contract harness, so a contract
// drift fails CI and external authors have the same checker to import.

describe('MachinePlugin contract', () => {
  it('atari-xl', () => assertMachinePlugin(atariXl))
  it('nes', () => assertMachinePlugin(machineNes))
  it('c64', () => assertMachinePlugin(machineC64))
  it('zx-spectrum', () => assertMachinePlugin(machineZx))
})

describe('PanelPlugin contract', () => {
  for (const p of [registersPanel, memoryPanel, outputPanel, ppuPanel, variablesPanel]) {
    it(p.id, () => assertPanelPlugin(p))
  }
})

// The backend is just a fixture to call attach() — the harness checks the
// DebugTarget's shape (descriptors + methods), not CPU↔backend integration — so a
// headless jsnes backend serves both adapters (chips wasm cores can't boot in node).
describe('DebugAdapterPlugin contract', () => {
  it('atari-6502-debug', async () => {
    assertDebugAdapterPlugin(atari6502DebugAdapter, await jsnesEmulator.createBackend())
  })
  it('zx-z80-debug', async () => {
    assertDebugAdapterPlugin(zxZ80DebugAdapter, await jsnesEmulator.createBackend())
  })
})

describe('ConverterModule contract', () => {
  for (const c of listBuiltins()) {
    it(c.meta.id, () => assertConverterPlugin(c))
  }
})

describe('EditorModule contract', () => {
  for (const e of listBuiltinEditors()) {
    it(e.meta.id, () => assertEditorPlugin(e))
  }
})
