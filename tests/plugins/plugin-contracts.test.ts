import { describe, it } from 'vitest'
import {
  assertConverterPlugin,
  assertDebugAdapterPlugin,
  assertEditorPlugin,
  assertMachinePlugin,
  assertPanelPlugin,
} from '@ports/test'
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'
import { machineC64 } from '@plugins/machine-c64'
import { registersPanel } from '@plugins/panel-registers'
import { memoryPanel } from '@plugins/panel-memory'
import { outputPanel } from '@plugins/panel-output'
import { ppuPanel } from '@plugins/panel-ppu'
import { atari6502DebugAdapter } from '@plugins/debug-atari-6502'
import { jsnesEmulator } from '@plugins/emulator-nes-jsnes'
import { listBuiltins } from '@plugins/converters'
import { listBuiltinEditors } from '@plugins/editors'

// Every built-in plugin runs through its kind's contract harness, so a contract
// drift fails CI and external authors have the same checker to import.

describe('MachinePlugin contract', () => {
  it('atari-xl', () => assertMachinePlugin(atariXl))
  it('nes', () => assertMachinePlugin(machineNes))
  it('c64', () => assertMachinePlugin(machineC64))
})

describe('PanelPlugin contract', () => {
  for (const p of [registersPanel, memoryPanel, outputPanel, ppuPanel]) {
    it(p.id, () => assertPanelPlugin(p))
  }
})

describe('DebugAdapterPlugin contract', () => {
  it('atari-6502-debug', async () => {
    assertDebugAdapterPlugin(atari6502DebugAdapter, await jsnesEmulator.createBackend())
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
