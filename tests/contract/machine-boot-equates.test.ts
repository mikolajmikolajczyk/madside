import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { atariXl } from '@plugins/machine-atari-xl'
import { machineNes } from '@plugins/machine-nes'

// The bootEquates string lives canonically on the MachinePlugin. The bundled
// templates ship a parallel copy as the equates file each template `icl`s.
// This catches drift between the two (read the template file straight off disk
// — the test runs from the repo root).

describe('Atari-XL boot equates', () => {
  it('canonical source is wired on the MachinePlugin', () => {
    expect(atariXl.bootEquates?.path).toBe('src/atari.a65')
    expect(atariXl.bootEquates?.content).toMatch(/SAVMSC\s*=\s*\$58/)
  })

  it('atari-hello template copy matches the MachinePlugin source', () => {
    const fromTemplate = readFileSync('templates/atari-hello/src/atari.a65', 'utf8')
    expect(fromTemplate).toBe(atariXl.bootEquates?.content)
  })
})

describe('NES boot equates', () => {
  it('canonical source is wired on the MachinePlugin', () => {
    expect(machineNes.bootEquates?.path).toBe('src/nes.a65')
    expect(machineNes.bootEquates?.content).toMatch(/PPUCTRL\s*=\s*\$2000/)
  })

  it('nes-hello template copy matches the MachinePlugin source', () => {
    const fromTemplate = readFileSync('templates/nes-hello/src/nes.a65', 'utf8')
    expect(fromTemplate).toBe(machineNes.bootEquates?.content)
  })
})
