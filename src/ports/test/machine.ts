// Contract harness for MachinePlugin authors (ADR-0005). Static-shape only —
// a machine plugin is pure data. Drop-in:
//
//   import { assertMachinePlugin } from '@ports/test'
//   it('contract', () => assertMachinePlugin(myMachine))

import { expect } from 'vitest'
import type { MachinePlugin } from '../plugin-machine'

const MEMORY_KINDS = new Set(['ram', 'rom', 'io', 'mirror', 'unmapped'])
const INPUT_KINDS = new Set(['keyboard', 'controller', 'mixed'])

export function assertMachinePlugin(machine: MachinePlugin): void {
  expect(machine.id, 'id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(machine.name, 'name must be non-empty').toBeTypeOf('string')
  expect(machine.name.length).toBeGreaterThan(0)
  expect(machine.cpu, 'cpu must be a non-empty id').toBeTypeOf('string')
  expect(machine.cpu.length).toBeGreaterThan(0)

  // Memory map — non-empty, each region well-formed.
  expect(Array.isArray(machine.memoryMap)).toBe(true)
  expect(machine.memoryMap.length, 'memoryMap must describe at least one region').toBeGreaterThan(0)
  for (const r of machine.memoryMap) {
    expect(r.start, `region '${r.name}': start ≤ end`).toBeLessThanOrEqual(r.end)
    expect(r.start, `region '${r.name}': start ≥ 0`).toBeGreaterThanOrEqual(0)
    expect(MEMORY_KINDS.has(r.kind), `region '${r.name}': kind '${r.kind}'`).toBe(true)
    expect(typeof r.writable, `region '${r.name}': writable boolean`).toBe('boolean')
    expect(r.name.length, 'region name non-empty').toBeGreaterThan(0)
  }

  // Display + audio + input.
  expect(machine.display.width, 'display.width > 0').toBeGreaterThan(0)
  expect(machine.display.height, 'display.height > 0').toBeGreaterThan(0)
  expect(machine.audio.sampleRate, 'audio.sampleRate > 0').toBeGreaterThan(0)
  expect(INPUT_KINDS.has(machine.input.kind), `input.kind '${machine.input.kind}'`).toBe(true)

  // Plugin-id reference arrays.
  for (const field of ['defaultPanels', 'compatibleToolchains', 'compatibleEmulators', 'compatibleDebugAdapters'] as const) {
    expect(Array.isArray(machine[field]), `${field} must be an array`).toBe(true)
    for (const id of machine[field]) expect(id, `${field} entry`).toBeTypeOf('string')
  }
  expect(machine.compatibleEmulators.length, 'a machine needs at least one compatible emulator').toBeGreaterThan(0)

  // Optional named memory spaces.
  if (machine.memorySpaces) {
    for (const s of machine.memorySpaces) {
      expect(s.id, 'memorySpace id non-empty').toBeTypeOf('string')
      expect(s.id.length).toBeGreaterThan(0)
    }
  }
}
