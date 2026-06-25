// Genesis Z80 $6000 bank window (#147 Phase 3). The Z80's $8000-$FFFF window
// banks into 68000 space via the write-only $6000 latch (1 bit per write, 9
// writes). Proven on gpgx: a Z80 driver that writes $6000 nine times sets the
// bank, and the backend reports it (z80_bank export + the bankMap projection).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { genesisGpgxEmulator } from '@madside/emulator-genesis-gpgx'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const CLOWN = repo('packages/wasm-clownassembler/clownassembler.wasm')
const Z80ASM = repo('packages/wasm-z88dk/z80asm.wasm')
const GPGX = repo('packages/wasm-genesis-gpgx/genesis-gpgx.wasm')
const tpl = (p: string) => repo('apps/ide/templates/genesis-z80-sound/' + p)

// A Z80 driver that loads the $6000 bank register with nine 1-bits, then spins.
// gpgx: zbank = ((zbank >> 1) | (bit << 23)) & 0xFF8000 → nine 1s ⇒ $FF8000.
const BANK_DRIVER = `	org	$0000
	ld	a,1
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
	ld	($6000),a
Loop:
	jp	Loop
`

describe('Genesis Z80 $6000 bank window (#147 Phase 3)', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) return new Response(await readFile(CLOWN), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('z80asm.wasm')) return new Response(await readFile(Z80ASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('genesis-gpgx.wasm')) return new Response(await readFile(GPGX), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('the Z80 sets the $6000 bank and the backend reports it via bankMap', async () => {
    // Reuse the sound template's M68k boot (it copies driver.bin to Z80 RAM +
    // starts the Z80), but swap in the bank-setting driver.
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-z80-banking',
      main: 'src/main.asm',
      files: [
        { path: 'src/main.asm', content: await readFile(tpl('src/main.asm')) },
        { path: 'src/genesis.inc', content: await readFile(tpl('src/genesis.inc')) },
        { path: 'src/sound/driver.s80', content: new TextEncoder().encode(BANK_DRIVER) },
      ],
      options: { z80: true },
    })
    expect(built.ok, `build failed: ${built.stderr}`).toBe(true)

    const backend = await genesisGpgxEmulator.createBackend()
    backend.loadMedia('bin', built.binary!)
    for (let i = 0; i < 6; i++) backend.advanceFrame()

    // After nine 1-bit writes the window base is $FF8000. Read it through the
    // Z80 aux CPU's bankMap (what the focused-Z80 memory panel projects).
    const proj = backend.auxCpu!('z80')!.bankMap!()
    expect(proj).toHaveLength(1)
    expect(proj[0].start).toBe(0x8000)
    expect(proj[0].end).toBe(0xffff)
    expect(proj[0].bankOffset).toBe(0xff8000)
    expect(proj[0].space).toBe('bank511') // 0xFF8000 >> 15
  })
})
