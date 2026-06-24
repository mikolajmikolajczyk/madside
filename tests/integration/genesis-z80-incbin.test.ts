// Genesis Z80 — de-risk for the pre-built sound-driver path (#147 Phase 1A).
// Most Genesis homebrew uses a ready Z80 sound driver (Echo / SMPS / XGM) shipped
// as a .bin and `incbin`'d into the 68000 ROM, which the 68000 then copies to the
// Z80's RAM at $A00000. Before building any composite toolchain, prove the
// foundation on the REAL tool: clownassembler resolves an `incbin` of a project
// binary (a subdir path), the blob's bytes land in the assembled ROM, and gpgx
// boots that ROM without choking on the embedded data.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { genesisGpgxEmulator } from '@madside/emulator-genesis-gpgx'
import { m68kDebugAdapter } from '@madside/debug-m68k'

const CLOWN_WASM = fileURLToPath(new URL('../../packages/wasm-clownassembler/clownassembler.wasm', import.meta.url))
const GPGX_WASM = fileURLToPath(new URL('../../packages/wasm-genesis-gpgx/genesis-gpgx.wasm', import.meta.url))

// A stand-in pre-built Z80 sound driver: a tiny Z80 program (di / ld a,0 / jp 0)
// plus a recognizable sentinel. The 68000 never executes it — it sits past the
// spin loop as ROM data — so its exact contents must survive incbin verbatim.
const Z80_BLOB = new Uint8Array([0xf3, 0x3e, 0x00, 0xc3, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef])

// asm68k: vector table → entry; load a sentinel, spin; then incbin the driver.
const SOURCE = `	dc.l	$00FFFFFC	; initial supervisor stack pointer
	dc.l	start		; reset vector -> entry PC
start:
	move.l	#$0000CAFE,d0
loop:
	bra	loop		; 68000 spins here — never executes the blob below
	even
Z80Driver:
	incbin	"src/sound/driver.bin"
Z80DriverEnd:
`

describe('Genesis Z80 — pre-built driver incbin (#147 Phase 1A de-risk)', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) return new Response(await readFile(CLOWN_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('genesis-gpgx.wasm')) return new Response(await readFile(GPGX_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('incbins a project binary into the ROM, verbatim, and the ROM still boots', async () => {
    // Assemble the M68k ROM with the Z80 blob mounted at a subdir path.
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-z80-it',
      main: 'src/main.asm',
      files: [
        { path: 'src/main.asm', content: new TextEncoder().encode(SOURCE) },
        { path: 'src/sound/driver.bin', content: Z80_BLOB },
      ],
    })
    expect(built.ok, `assemble failed: ${built.stderr}`).toBe(true)

    // The incbin'd bytes land in the ROM at the Z80Driver label, verbatim.
    const off = built.labels?.get('Z80Driver')
    expect(off, 'Z80Driver label missing').toBeDefined()
    const inRom = Array.from(built.binary!.slice(off!, off! + Z80_BLOB.length))
    expect(inRom).toEqual(Array.from(Z80_BLOB))
    // The driver region is bounded by the two labels (no padding swallowed it).
    expect(built.labels?.get('Z80DriverEnd')).toBe(off! + Z80_BLOB.length)

    // gpgx boots the ROM (embedded data + all) and runs the 68000 entry — the
    // blob past the spin loop doesn't derail the reset path.
    const backend = await genesisGpgxEmulator.createBackend()
    backend.loadMedia('bin', built.binary!)
    expect(backend.getPC()).toBe(0x8) // reset vector → start
    const dbg = m68kDebugAdapter.attach(backend)
    await dbg.stepFrame()
    expect((await dbg.readRegisters()).d0 >>> 0).toBe(0x0000cafe)
  })
})
