// End-to-end audio proof for the jsnes backend (#4): assemble the
// nes-apu-hello template with MADS, run it on the jsnes core, and assert the
// APU actually emits a non-silent tone through onAudioSample. Headless — no
// browser AudioContext involved; we read the accumulation buffer directly.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const WASM_PATH = repo('packages/wasm-mads/mads.wasm')
const SRC = 'templates/nes-apu-hello/src/'

const enc = new TextEncoder()
const srcFile = async (name: string) => ({
  path: 'src/' + name,
  content: enc.encode(await readFile(repo(SRC + name), 'utf8')),
})

describe('NES APU — nes-apu-hello plays a non-silent tone', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    // Node can't serve the Vite `?url` wasm asset — shim fetch to read it off disk.
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('mads.wasm')) {
        const bytes = await readFile(WASM_PATH)
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })

  afterAll(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  it('assembles with MADS and emits audio on pulse 1', async () => {
    const main = 'src/nes-apu-hello.a65'
    const out = await madsToolchain.build({
      projectId: 'nes-apu-hello',
      main,
      files: [await srcFile('nes-apu-hello.a65'), await srcFile('nes.a65')],
    })
    expect(out.ok, out.stderr).toBe(true)
    expect(out.binary).toBeInstanceOf(Uint8Array)

    const be = await jsnesEmulator.createBackend()
    be.loadMedia('nes', out.binary!)
    // A handful of frames: the program configures the APU in the first few
    // instructions, then the channel emits for the rest of every frame.
    for (let i = 0; i < 8; i++) be.advanceFrame()

    // The backend buffers samples for the (browser-only) AudioWorklet sink.
    const audio = be as unknown as { audioAccum: Float32Array; audioLen: number }
    expect(audio.audioLen, 'APU produced samples').toBeGreaterThan(0)
    let peak = 0
    for (let i = 0; i < audio.audioLen; i++) {
      const a = Math.abs(audio.audioAccum[i]!)
      if (a > peak) peak = a
    }
    expect(peak, 'tone is audibly non-silent').toBeGreaterThan(0.01)
  })
})
