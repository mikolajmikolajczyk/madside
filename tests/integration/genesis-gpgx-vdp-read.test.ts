// VDP-space reads through the real GenesisGpgxBackend (#146). A tiny 68000
// program writes one colour into CRAM via the VDP data port; we then read it
// back through readMem('cram', …) and check the bytes come out in Genesis
// (big-endian) order. Also asserts vram/vsram reads return the declared sizes.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGenesisGpgxBackend } from '@madside/emulator-genesis-gpgx'

const WASM = fileURLToPath(new URL('../../packages/wasm-genesis-gpgx/genesis-gpgx.wasm', import.meta.url))

function buildRom(): Uint8Array {
  const rom = new Uint8Array(0x400)
  const be32 = (o: number, v: number) => { rom[o] = v >>> 24; rom[o + 1] = v >>> 16; rom[o + 2] = v >>> 8; rom[o + 3] = v }
  be32(0x000, 0x00fffffe) // initial SSP
  be32(0x004, 0x00000200) // reset PC
  for (let i = 0; i < 16; i++) rom[0x100 + i] = 'SEGA GENESIS    '.charCodeAt(i)
  let p = 0x200
  const w = (...b: number[]) => { rom.set(b, p); p += b.length }
  // move.w #$8104,$C00004 → VDP reg1 = $04 (Mode 5; needed for the two-word
  // address latch's pending flag, reg[1]&4, to take effect).
  w(0x33, 0xfc, 0x81, 0x04, 0x00, 0xc0, 0x00, 0x04)
  // Two-word control write: address = CRAM[0], code = $03 (CRAM write).
  w(0x33, 0xfc, 0xc0, 0x00, 0x00, 0xc0, 0x00, 0x04) // move.w #$C000,$C00004
  w(0x33, 0xfc, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x04) // move.w #$0000,$C00004
  // move.w #$0EEE,$C00000 → write colour to CRAM[0] via the data port.
  w(0x33, 0xfc, 0x0e, 0xee, 0x00, 0xc0, 0x00, 0x00)
  w(0x60, 0xfe) // bra.s self — park the CPU
  return rom
}

describe('GenesisGpgxBackend VDP-space reads (#146)', () => {
  let original: typeof globalThis.fetch | undefined
  beforeAll(() => {
    original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('genesis-gpgx.wasm')) {
        return new Response(await readFile(WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (original) return original(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (original) globalThis.fetch = original })

  it('reads CRAM back in Genesis byte order after a data-port write', async () => {
    const backend = await createGenesisGpgxBackend()
    backend.loadMedia('bin', buildRom())
    backend.advanceFrame() // runs the setup, then spins on bra.s

    const cram = backend.readMem(0, 4, 'cram')
    // gpgx packs the raw bus colour $0EEE (BBB0GGG0RRR0) to 9-bit BBBGGGRRR =
    // $01FF; the big-endian word at CRAM[0] must be that packed value.
    expect((cram[0]! << 8) | cram[1]!).toBe(0x01ff)
  })

  it('serves the full VRAM/VSRAM spaces without throwing', async () => {
    const backend = await createGenesisGpgxBackend()
    backend.loadMedia('bin', buildRom())
    backend.advanceFrame()

    expect(backend.readMem(0, 0x10000, 'vram')).toHaveLength(0x10000)
    expect(backend.readMem(0, 0x50, 'vsram')).toHaveLength(0x50)
    // VDP registers: the ROM set reg1 = $04 (Mode 5), readable through vdp-regs.
    expect(backend.readMem(0, 0x20, 'vdp-regs')[1]).toBe(0x04)
    // Out-of-range tail reads zero, never throws.
    const tail = backend.readMem(0xfffe, 4, 'vram')
    expect(tail).toHaveLength(4)
    expect(tail[2]).toBe(0)
    expect(tail[3]).toBe(0)
  })

  it('rejects an unknown space', async () => {
    const backend = await createGenesisGpgxBackend()
    backend.loadMedia('bin', buildRom())
    expect(() => backend.readMem(0, 1, 'bogus')).toThrow(/unknown space/)
  })
})
