import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { assertEmulatorPlugin } from '@ports/test'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'
import { chipsC64Emulator } from '@madside/emulator-c64-chips'
import { genesisMusashiEmulator } from '@madside/emulator-genesis-musashi'
import { altirraEmulator } from '@adapters/emu'

// Built-in emulators satisfy the same EmulatorPlugin contract.

// jsnes is pure JS — boots headless, so it gets the full RunBackend round-trip.
describe('jsnes satisfies EmulatorPlugin', () => {
  it('contract', () => assertEmulatorPlugin(jsnesEmulator))
})

// Altirra's wasm core needs a browser to instantiate; verify the static plugin
// shape only. Actual boot is covered by the in-app smoke test.
describe('altirra satisfies EmulatorPlugin', () => {
  it('contract (shape only)', () => assertEmulatorPlugin(altirraEmulator, { boots: false }))
})

// chips C64 core is wasm — needs a browser to instantiate; verify the static
// plugin shape only. Actual boot is covered by the in-app smoke test.
describe('chips-c64 satisfies EmulatorPlugin', () => {
  it('contract (shape only)', () => assertEmulatorPlugin(chipsC64Emulator, { boots: false }))
})

// Musashi is a plain wasi reactor (no browser APIs), so it boots headless for the
// full round-trip — shim fetch to serve the wasm from disk in the Node test env.
const MUSASHI_WASM = fileURLToPath(
  new URL('../../../packages/wasm-musashi/musashi.wasm', import.meta.url),
)
describe('genesis-musashi satisfies EmulatorPlugin', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('musashi.wasm')) {
        const bytes = await readFile(MUSASHI_WASM)
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('contract', () => assertEmulatorPlugin(genesisMusashiEmulator))
})
