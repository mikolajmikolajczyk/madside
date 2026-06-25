// Focused-CPU routing for multi-CPU machines (#147 Phase 2): the DebugService
// routes registers/memory/PC through the focused CPU's adapter + the backend's
// auxCpu(id) view, and back to the primary on null.

import { describe, expect, it } from 'vitest'
import { createEventBus } from './event-bus'
import { createDebugService } from './debug-service'
import type { AuxCpuView, DebugAdapterPlugin, DebugTarget, RunBackend, RunService } from '@ports'

// A backend whose primary CPU reads $100 and whose 'z80' aux view reads $10.
function dualBackend(): RunBackend {
  const z80: AuxCpuView = {
    cpuState: () => ({ tag: 'z80' }),
    getPC: () => 0x10,
    readMem: () => new Uint8Array([0x80]),
  }
  return {
    width: 1, height: 1, pixels: new Uint32Array(1),
    loadMedia: () => undefined,
    advanceFrame: () => 0,
    step: () => 0,
    cpuState: () => ({ tag: 'm68k' }),
    getPC: () => 0x100,
    isAtInstrBoundary: () => true,
    readMem: () => new Uint8Array([0x68]),
    setBreakpoints: () => undefined,
    sendKey: () => undefined,
    saveState: () => null,
    loadState: () => undefined,
    startAudio: async () => {},
    suspendAudio: async () => {},
    auxCpu: (id) => (id === 'z80' ? z80 : undefined),
  }
}

// A trivial adapter that surfaces whatever backend it's attached to.
function passthroughAdapter(id: string): DebugAdapterPlugin {
  return {
    kind: 'debug-adapter', id, name: id,
    attach: (backend: RunBackend): DebugTarget => ({
      registers: [], flags: [],
      readRegisters: async () => ({}),
      readFlags: async () => ({}),
      step: async () => { backend.step(); return backend.getPC() },
      stepFrame: async () => { backend.advanceFrame(); return backend.getPC() },
      setBreakpoints: (a) => backend.setBreakpoints(a),
      readMemory: async (addr, len, space) => backend.readMem(addr, len, space),
      writeMemory: async () => {},
      getPC: () => backend.getPC(),
      isAtInstrBoundary: () => backend.isAtInstrBoundary(),
    }),
  }
}

function setup() {
  const backend = dualBackend()
  const run = { backend: () => backend } as unknown as RunService
  return createDebugService({
    events: createEventBus(),
    run,
    adapter: passthroughAdapter('m68k-debug'),
    auxAdapters: { z80: passthroughAdapter('zx-z80-debug') },
  })
}

describe('DebugService focused-CPU routing', () => {
  it('reads the primary CPU by default, the aux CPU when focused', async () => {
    const debug = setup()
    expect(debug.focusedCpu()).toBeNull()
    expect(debug.target()!.getPC()).toBe(0x100) // m68k
    expect((await debug.readMemory(0, 1))[0]).toBe(0x68)

    debug.setFocusedCpu('z80')
    expect(debug.focusedCpu()).toBe('z80')
    expect(debug.target()!.getPC()).toBe(0x10) // z80 view
    expect((await debug.readMemory(0, 1))[0]).toBe(0x80)

    debug.setFocusedCpu(null)
    expect(debug.target()!.getPC()).toBe(0x100) // back to m68k
  })

  it('falls back to the primary when the focused cpu has no aux view / adapter', () => {
    const debug = setup()
    debug.setFocusedCpu('nope') // no auxCpu('nope'), no adapter
    expect(debug.target()!.getPC()).toBe(0x100) // primary, not crashed
  })

  it('setAdapter resets the focus to the new machine primary', () => {
    const debug = setup()
    debug.setFocusedCpu('z80')
    debug.setAdapter(passthroughAdapter('m68k-debug'))
    expect(debug.focusedCpu()).toBeNull()
  })
})
