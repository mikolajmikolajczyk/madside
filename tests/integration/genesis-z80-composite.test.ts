// Genesis Z80 — own-source composite build (#147 Phase 1B). With
// `build.options.z80` set, the clownassembler toolchain assembles the project's
// OWN Z80 source (.s80) with z80asm into a sibling .bin the M68k source incbin's
// — the same multi-tool-under-one-plugin pattern as cc65/z88dk. Proven on the
// real assemblers: the z80asm output bytes land in the assembled ROM verbatim.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { assembleZ80Flat } from '@madside/toolchain-z88dk'

const CLOWN_WASM = fileURLToPath(new URL('../../packages/wasm-clownassembler/clownassembler.wasm', import.meta.url))
const Z80ASM_WASM = fileURLToPath(new URL('../../packages/wasm-z88dk/z80asm.wasm', import.meta.url))

// A tiny Z80 sound driver (the project's own source): set a byte, spin.
const DRIVER_S80 = `	org	$0000
	di
	ld	a,$42
	ld	($4000),a
loop:
	jp	loop
`

// M68k ROM that incbins the composite's z80asm output (driver.s80 → driver.bin).
const MAIN_ASM = `	dc.l	$00FFFFFC	; SSP
	dc.l	start		; reset PC
start:
	move.l	#$0000CAFE,d0
spin:
	bra	spin
	even
Z80Driver:
	incbin	"src/sound/driver.bin"
Z80DriverEnd:
`

describe('Genesis Z80 — composite own-source build (#147 Phase 1B)', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) return new Response(await readFile(CLOWN_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('z80asm.wasm')) return new Response(await readFile(Z80ASM_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('assembles the .s80 with z80asm and incbins it into the M68k ROM', async () => {
    const files = [
      { path: 'src/main.asm', content: new TextEncoder().encode(MAIN_ASM) },
      { path: 'src/sound/driver.s80', content: new TextEncoder().encode(DRIVER_S80) },
    ]

    // The composite build with the opt-in flag.
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-z80-composite',
      main: 'src/main.asm',
      files,
      options: { z80: true },
    })
    expect(built.ok, `build failed: ${built.stderr}`).toBe(true)

    // What z80asm produces for the driver, standalone — the composite must inject
    // exactly these bytes.
    const expected = await assembleZ80Flat('src/sound/driver.s80', [{ path: 'src/sound/driver.s80', content: DRIVER_S80 }])
    expect(expected.ok, `z80asm failed: ${expected.stderr}`).toBe(true)
    expect(expected.binary![0]).toBe(0xf3) // `di`

    // The driver bytes land in the ROM at the Z80Driver label, verbatim.
    const off = built.labels?.get('Z80Driver')
    expect(off, 'Z80Driver label missing').toBeDefined()
    const inRom = Array.from(built.binary!.slice(off!, off! + expected.binary!.length))
    expect(inRom).toEqual(Array.from(expected.binary!))
    expect(built.labels?.get('Z80DriverEnd')).toBe(off! + expected.binary!.length)
  })

  it('without the flag, the .s80 is ignored (no .bin injected → incbin fails)', async () => {
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-z80-noflag',
      main: 'src/main.asm',
      files: [
        { path: 'src/main.asm', content: new TextEncoder().encode(MAIN_ASM) },
        { path: 'src/sound/driver.s80', content: new TextEncoder().encode(DRIVER_S80) },
      ],
      // no options.z80 → no composite step → driver.bin never produced
    })
    expect(built.ok).toBe(false) // incbin "driver.bin" can't resolve
  })
})
