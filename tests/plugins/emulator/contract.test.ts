import { describe, it } from 'vitest'
import { assertEmulatorPlugin } from '@ports/test'
import { jsnesEmulator } from '@plugins/emulator-nes-jsnes'
import { altirraEmulator } from '@adapters/emu'

// Both built-in emulators satisfy the same EmulatorPlugin contract.

// jsnes is pure JS — boots headless, so it gets the full RunBackend round-trip.
describe('jsnes satisfies EmulatorPlugin', () => {
  it('contract', () => assertEmulatorPlugin(jsnesEmulator))
})

// Altirra's wasm core needs a browser to instantiate; verify the static plugin
// shape only. Actual boot is covered by the in-app smoke test.
describe('altirra satisfies EmulatorPlugin', () => {
  it('contract (shape only)', () => assertEmulatorPlugin(altirraEmulator, { boots: false }))
})
