// Genesis Z80 sound — runnable template, built + booted end to end (#147).
// Loads the actual genesis-z80-sound template, assembles it through the composite
// toolchain (M68k + the opt-in z80asm step), and boots the ROM on gpgx. Asserts
// the 68000 completes the Z80 boot sequence (bus request → copy driver → release)
// and reaches its idle loop — i.e. the bus handshake actually resolves on the
// core, the driver is in place, and the Z80 is running.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { genesisGpgxEmulator } from '@madside/emulator-genesis-gpgx'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const CLOWN_WASM = repo('packages/wasm-clownassembler/clownassembler.wasm')
const Z80ASM_WASM = repo('packages/wasm-z88dk/z80asm.wasm')
const GPGX_WASM = repo('packages/wasm-genesis-gpgx/genesis-gpgx.wasm')
const tpl = (p: string) => repo('apps/ide/templates/genesis-z80-sound/' + p)

describe('Genesis Z80 sound template — build + boot (#147)', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) return new Response(await readFile(CLOWN_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('z80asm.wasm')) return new Response(await readFile(Z80ASM_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('genesis-gpgx.wasm')) return new Response(await readFile(GPGX_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('assembles the M68k + Z80 sources and the 68000 completes the Z80 boot', async () => {
    const files = [
      { path: 'src/main.asm', content: await readFile(tpl('src/main.asm')) },
      { path: 'src/genesis.inc', content: await readFile(tpl('src/genesis.inc')) },
      { path: 'src/sound/driver.s80', content: await readFile(tpl('src/sound/driver.s80')) },
    ]
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-z80-template',
      main: 'src/main.asm',
      files,
      options: { z80: true },
    })
    expect(built.ok, `build failed: ${built.stderr}`).toBe(true)
    // The Z80 driver (di = $F3) was assembled + embedded at the Z80Driver label.
    const dz = built.labels?.get('Z80Driver')
    expect(dz, 'Z80Driver label missing').toBeDefined()
    expect(built.binary![dz!]).toBe(0xf3)

    // Boot the ROM and run a few frames; the 68000 should clear the VDP + Z80
    // boot sequence and settle in its idle loop at `Forever`. If the bus
    // handshake (.WaitZ80) didn't resolve on the core, PC would be stuck there.
    const backend = await genesisGpgxEmulator.createBackend()
    backend.loadMedia('bin', built.binary!)
    for (let i = 0; i < 4; i++) backend.advanceFrame()
    expect(backend.getPC()).toBe(built.labels?.get('Forever'))

    // The Z80 ran and drove the PSG: gpgx's audio output is non-silent. Run more
    // frames so the tone settles, then peak-check the drained YM2612/PSG samples
    // (this is the audio the AudioPushPump streams to the worklet in-app).
    for (let i = 0; i < 60; i++) backend.advanceFrame()
    const audio = (backend as unknown as { audioQueue: number[] }).audioQueue
    const peak = audio.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak, 'Z80 produced no PSG audio').toBeGreaterThan(0.01)
  })
})
