import { describe, expect, it } from 'vitest'
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'
// Adapter side keeps a parallel copy of the same string — see seed.ts for the
// ADR-0002 rationale. This test catches drift between the two until v0.5.0
// ToolchainPlugin work collapses the duplicate.
import {
  SEED_ATARI_FOR_TESTS as adapterSeedAtari,
  SEED_NES_EQUATES_FOR_TESTS as adapterSeedNes,
} from '@adapters/storage-idb'

describe('Atari-XL boot equates', () => {
  it('canonical source is wired on the MachinePlugin', () => {
    expect(atariXl.bootEquates?.path).toBe('src/atari.a65')
    expect(atariXl.bootEquates?.content).toMatch(/SAVMSC\s*=\s*\$58/)
  })

  it('seed.ts parallel copy matches the MachinePlugin source', () => {
    expect(adapterSeedAtari).toBe(atariXl.bootEquates?.content)
  })
})

describe('NES boot equates', () => {
  it('canonical source is wired on the MachinePlugin', () => {
    expect(machineNes.bootEquates?.path).toBe('src/nes.a65')
    expect(machineNes.bootEquates?.content).toMatch(/PPUCTRL\s*=\s*\$2000/)
  })

  it('seed.ts parallel copy matches the MachinePlugin source', () => {
    expect(adapterSeedNes).toBe(machineNes.bootEquates?.content)
  })
})
