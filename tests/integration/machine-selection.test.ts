import { describe, expect, it } from 'vitest'
import { createWorkbench } from '@app/createWorkbench'
import { createMemoryStorage } from '@adapters/storage-memory'
import { createNoopLogger } from '@adapters/logger'
import type { RunBackend } from '@ports'

// Manifest-driven machine selection (1972a36). setActiveMachine swaps the
// active MachinePlugin + reconfigures the RunService backend + notifies
// subscribers. The atari-xl backend is stubbed (no wasm fetch); switching to
// NES boots the real jsnes core (pure JS, headless-safe).

function stubBackend(width = 336, height = 224): RunBackend {
  return {
    width,
    height,
    sampleRate: 48000,
    pixels: new Uint32Array(width * height),
    loadMedia: () => undefined,
    advanceFrame: () => 0,
    step: () => 0,
    cpuState: () => ({}),
    getPC: () => 0,
    isAtInstrBoundary: () => true,
    readMem: () => new Uint8Array(),
    setBreakpoints: () => undefined,
    sendKey: () => undefined,
    saveState: () => null,
    loadState: () => undefined,
    startAudio: async () => {},
    suspendAudio: async () => {},
  }
}

describe('manifest-driven machine selection', () => {
  it('defaults to atari-xl and resolves machine-nes via the registry', () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      emuBackendFactory: async () => stubBackend(),
    })
    expect(wb.machine.id).toBe('atari-xl')
    expect(wb.plugins.get('machine', 'nes')?.id).toBe('nes')
  })

  it('swaps machine + backend on setActiveMachine, notifying subscribers once', async () => {
    const atari = stubBackend()
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      emuBackendFactory: async () => atari,
    })

    // Atari boots the stub backend.
    expect(await wb.run.boot()).toBe(atari)

    let fired = 0
    const off = wb.subscribeMachine(() => { fired += 1 })

    wb.setActiveMachine('nes')
    expect(wb.machine.id).toBe('nes')
    expect(fired).toBe(1)
    // reconfigure dropped the booted stub — next boot builds the jsnes core.
    const nes = await wb.run.boot()
    expect(nes).not.toBe(atari)
    expect(nes.width).toBe(256)
    expect(nes.height).toBe(240)

    // Back to atari → stub factory applies again.
    wb.setActiveMachine('atari-xl')
    expect(wb.machine.id).toBe('atari-xl')
    expect(fired).toBe(2)
    expect(await wb.run.boot()).toBe(atari)

    off()
  })

  it('is a no-op for the already-active machine and for unknown ids', () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      emuBackendFactory: async () => stubBackend(),
    })
    let fired = 0
    wb.subscribeMachine(() => { fired += 1 })

    wb.setActiveMachine('atari-xl') // already active
    expect(fired).toBe(0)

    wb.setActiveMachine('nonexistent-machine') // unknown — keep current, no notify
    expect(wb.machine.id).toBe('atari-xl')
    expect(fired).toBe(0)
  })

  it('resolves the genesis machine + its emulator from the registry (#145)', () => {
    // Regression: machineSetups was missing a 'genesis' entry, so loading a
    // Genesis project left the previously-active machine's backend running
    // (e.g. C64). Switching must land on genesis with its gpgx backend.
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      emuBackendFactory: async () => stubBackend(),
    })
    wb.setActiveMachine('genesis')
    expect(wb.machine.id).toBe('genesis')
    expect(wb.plugins.get('emulator', 'genesis-gpgx')?.id).toBe('genesis-gpgx')
  })
})
