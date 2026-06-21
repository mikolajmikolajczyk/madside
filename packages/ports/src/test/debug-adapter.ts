// Contract harness for DebugAdapterPlugin authors (ADR-0005). Checks the static
// shape + that attach() yields a well-formed DebugTarget. Pass a headless-
// bootable backend (e.g. jsnesEmulator.createBackend()) as the fixture.
//
//   import { assertDebugAdapterPlugin } from '@ports/test'
//   it('contract', async () =>
//     assertDebugAdapterPlugin(myAdapter, await jsnesEmulator.createBackend()))

import { expect } from 'vitest'
import type { DebugAdapterPlugin } from '../plugin-debug'
import type { RunBackend } from '../services/run-service'

const TARGET_METHODS = [
  'readRegisters',
  'readFlags',
  'step',
  'stepFrame',
  'setBreakpoints',
  'readMemory',
  'writeMemory',
  'getPC',
  'isAtInstrBoundary',
] as const

export function assertDebugAdapterPlugin(plugin: DebugAdapterPlugin, backend: RunBackend): void {
  expect(plugin.id, 'id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(plugin.name, 'name must be non-empty').toBeTypeOf('string')
  expect(plugin.name.length).toBeGreaterThan(0)
  expect(typeof plugin.attach, 'attach must be a function').toBe('function')

  const target = plugin.attach(backend)
  expect(Array.isArray(target.registers), 'registers descriptor array').toBe(true)
  expect(target.registers.length, 'at least one register descriptor').toBeGreaterThan(0)
  expect(Array.isArray(target.flags), 'flags descriptor array').toBe(true)
  for (const m of TARGET_METHODS) {
    expect(typeof target[m], `DebugTarget.${m} must be a function`).toBe('function')
  }
  // getPC is synchronous + cheap.
  expect(typeof target.getPC(), 'getPC returns a number').toBe('number')
  expect(typeof target.isAtInstrBoundary(), 'isAtInstrBoundary returns a boolean').toBe('boolean')
}
