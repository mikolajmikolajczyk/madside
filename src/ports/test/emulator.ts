// Contract harness for EmulatorPlugin authors (ADR-0005). One-line drop-in:
//
//   import { assertEmulatorPlugin } from '@ports/test'
//   import { myEmulator } from './my-emulator'
//   import { describe, it } from 'vitest'
//
//   describe('my-emulator satisfies EmulatorPlugin', () => {
//     it('contract', () => assertEmulatorPlugin(myEmulator))
//   })
//
// The harness exits via Vitest `expect` — any violation is a normal failure.
// Cores that need a browser to instantiate (wasm) pass `{ boots: false }` to
// check the static shape only; pure-JS cores boot headless and get the full
// RunBackend round-trip.

import { expect } from 'vitest'
import type { EmulatorPlugin } from '../plugin-emulator'

export interface EmulatorHarnessOptions {
  /** Call `createBackend()` and check the resulting RunBackend. Default true.
   *  Set false for cores that can't instantiate headless (e.g. wasm needing a
   *  browser) — only the static plugin shape is then verified. */
  boots?: boolean
}

const RUN_BACKEND_METHODS = [
  'loadMedia',
  'advanceFrame',
  'step',
  'cpuState',
  'getPC',
  'isAtInstrBoundary',
  'readMem',
  'setBreakpoints',
  'sendKey',
  'saveState',
  'loadState',
] as const

export async function assertEmulatorPlugin(
  plugin: EmulatorPlugin,
  opts: EmulatorHarnessOptions = {},
): Promise<void> {
  // --- Static shape ---
  expect(plugin.kind, "kind must be 'emulator'").toBe('emulator')
  expect(plugin.id, 'id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(plugin.name, 'name must be non-empty').toBeTypeOf('string')
  expect(plugin.name.length).toBeGreaterThan(0)
  expect(typeof plugin.createBackend, 'createBackend must be a function').toBe('function')

  if (opts.boots === false) return

  // --- Backend round-trip (headless-bootable cores) ---
  const backend = await plugin.createBackend()
  expect(backend.width, 'width must be > 0').toBeGreaterThan(0)
  expect(backend.height, 'height must be > 0').toBeGreaterThan(0)
  expect(backend.pixels, 'pixels must be a Uint32Array').toBeInstanceOf(Uint32Array)
  expect(backend.pixels.length, 'pixels length must equal width*height').toBe(
    backend.width * backend.height,
  )
  for (const m of RUN_BACKEND_METHODS) {
    expect(typeof backend[m], `backend.${m} must be a function`).toBe('function')
  }
}
