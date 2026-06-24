// LIVE-CORE proof for ZX Spectrum 128K paging (ADR-0014, #134). The $7FFD paging
// latch is WRITE-ONLY (and absent on the 48K — which is why 128K is a separate
// machine), so the chips backend reads the live RAM bank from the core's tracked
// last_mem_config, exposed via getMemConfig(). This boots the real chips zx core
// in 128K mode, runs a tiny program that selects RAM bank 3 into the $C000
// window via OUT ($7FFD), and asserts bankMap() reports it — reusing the same
// bank-aware contract as Atari/NES.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { machineZx128 } from '@madside/machine-zx'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const ZX_WASM = repo('packages/wasm-chips/zx-core.wasm')

// Minimal 48K-format .sna whose program (in fixed RAM at $8000, bank 2) selects
// RAM bank 3 into $C000 by writing $7FFD, then loops. .sna = 27-byte header +
// 49152 bytes of RAM ($4000-$FFFF); PC is popped from SP.
function buildSna(bank: number): Uint8Array {
  const sna = new Uint8Array(27 + 0xc000)
  sna[0] = 0x3f // I
  sna[23] = 0xfe // SP lo  → $BFFE
  sna[24] = 0xbf // SP hi
  sna[25] = 1 // IM 1
  const ram = sna.subarray(27) // index 0 = $4000
  // $8000: ld bc,$7ffd ; ld a,bank ; out (c),a ; jr $
  ram.set([0x01, 0xfd, 0x7f, 0x3e, bank, 0xed, 0x79, 0x18, 0xfe], 0x8000 - 0x4000)
  ram[0xbffe - 0x4000] = 0x00 // (SP) → $8000
  ram[0xbfff - 0x4000] = 0x80
  return sna
}

describe('ZX Spectrum 128K live bankMap() on the real chips core (ADR-0014)', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('zx-core.wasm')) {
        return new Response(await readFile(ZX_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (url.endsWith('.rom')) {
        // Backend fetches the bundled ROMs by their ?url path; serve from disk.
        const name = url.slice(url.lastIndexOf('/') + 1)
        return new Response(await readFile(repo(`packages/emulator-zx-chips/src/roms/${name}`)), { status: 200 })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })

  afterAll(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  it('bankMap() reports the RAM bank the program pages into $C000 via $7FFD', async () => {
    // machineZx128.banks drives the backend into 128K mode.
    const backend = await chipsZxEmulator.createBackend(machineZx128.banks)
    backend.loadMedia('sna', buildSna(3))
    for (let i = 0; i < 4; i++) backend.advanceFrame() // run the OUT ($7FFD),3

    expect(backend.bankMap!()).toEqual([
      { window: 'main', start: 0xc000, end: 0xffff, space: 'bank3', bankOffset: 3 * 0x4000 },
    ])

    // A different bank selection is tracked live too.
    const b2 = await chipsZxEmulator.createBackend(machineZx128.banks)
    b2.loadMedia('sna', buildSna(6))
    for (let i = 0; i < 4; i++) b2.advanceFrame()
    expect(b2.bankMap!()[0]).toMatchObject({ space: 'bank6' })
  })
})
