// End-to-end Genesis / 68000 contract chain (#145): assemble real M68k source
// with clownassembler, load the binary into the Genesis Plus GX emulator, run it,
// and read a register + memory back through the m68k debug adapter. If this
// passes, every plugin contract — toolchain, emulator, debug — holds for a
// 32-bit, alien-ISA CPU end-to-end, not just in isolation.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'
import { genesisGpgxEmulator } from '@madside/emulator-genesis-gpgx'
import { m68kDebugAdapter } from '@madside/debug-m68k'

const CLOWN_WASM = fileURLToPath(new URL('../../packages/wasm-clownassembler/clownassembler.wasm', import.meta.url))
const GPGX_WASM = fileURLToPath(new URL('../../packages/wasm-genesis-gpgx/genesis-gpgx.wasm', import.meta.url))

// A minimal Genesis ROM: vector table (SSP, reset PC → start) + code that loads a
// sentinel into D0 and spins. asm68k syntax (clownassembler).
const SOURCE = `	dc.l	$00FFFFFC	; initial supervisor stack pointer
	dc.l	start		; reset vector -> entry PC
start:
	move.l	#$0000CAFE,d0
loop:
	bra	loop
`

describe('Genesis 68000 chain — clownassembler → gpgx → m68k debug', () => {
  let originalFetch: typeof globalThis.fetch | undefined
  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) {
        return new Response(await readFile(CLOWN_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (url.includes('genesis-gpgx.wasm')) {
        return new Response(await readFile(GPGX_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch })

  it('assembles, runs, and reads D0 back across all three plugins', async () => {
    // 1. Toolchain: assemble the M68k source to a flat binary.
    const built = await clownassemblerToolchain.build({
      projectId: 'genesis-it',
      main: 'src/main.asm',
      files: [{ path: 'src/main.asm', content: new TextEncoder().encode(SOURCE) }],
    })
    expect(built.ok, `assemble failed: ${built.stderr}`).toBe(true)
    expect(built.binary!.byteLength).toBeGreaterThan(8)
    // The reset vector ($4) points at `start` ($00000008 — after the 8-byte table).
    expect(built.labels?.get('start')).toBe(0x8)

    // Line↔address source map: the `move.l` on line 4 emits at $8, and $8 maps
    // back to it — line-debug can set a breakpoint by line.
    expect(built.sourceMap?.locToAddr.get('src/main.asm')?.get(4)).toBe(0x8)
    expect(built.sourceMap?.addrToLoc.get(0x8)).toEqual({ file: 'src/main.asm', line: 4 })

    // 2. Emulator: boot gpgx and load the ROM (reset reads SSP/PC from $0/$4).
    const backend = await genesisGpgxEmulator.createBackend()
    backend.loadMedia('bin', built.binary!)
    expect(backend.getPC()).toBe(0x8) // entry PC from the reset vector

    // 3. Debug adapter: attach, run a frame, read the register file.
    const dbg = m68kDebugAdapter.attach(backend)
    expect(dbg.registers.some((r) => r.id === 'd0')).toBe(true)
    await dbg.stepFrame()
    const regs = await dbg.readRegisters()
    expect(regs.d0 >>> 0).toBe(0x0000cafe) // the sentinel the program loaded

    // The debug adapter also reads memory at native 24-bit width: the ROM byte at
    // $8 is the move.l opcode high byte ($20).
    const mem = await dbg.readMemory(0x8, 1)
    expect(mem[0]).toBe(0x20)
  })
})
