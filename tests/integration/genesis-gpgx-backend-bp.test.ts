// Genesis breakpoints through the real GenesisGpgxBackend class (#146) — the TS
// layer the IDE actually drives (setBreakpoints + advanceFrame), not just the
// raw wasm. Proves a breakpoint set via the backend stops advanceFrame with the
// 68000 PC at the breakpoint.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGenesisGpgxBackend } from '@madside/emulator-genesis-gpgx'

const WASM = fileURLToPath(new URL('../../packages/wasm-genesis-gpgx/genesis-gpgx.wasm', import.meta.url))

function buildRom(): Uint8Array {
  const rom = new Uint8Array(0x400)
  const be32 = (o: number, v: number) => { rom[o] = v >>> 24; rom[o + 1] = v >>> 16; rom[o + 2] = v >>> 8; rom[o + 3] = v }
  be32(0x000, 0x00fffffe)
  be32(0x004, 0x00000200)
  for (let i = 0; i < 16; i++) rom[0x100 + i] = 'SEGA GENESIS    '.charCodeAt(i)
  rom.set([0x20, 0x3c, 0x12, 0x34, 0x56, 0x78], 0x200) // move.l #$12345678,d0
  rom.set([0x52, 0x80], 0x206)                          // addq.l #1,d0
  rom.set([0x60, 0xfc], 0x208)                          // bra.s  $206
  return rom
}

describe('GenesisGpgxBackend breakpoints (#146)', () => {
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

  it('setBreakpoints + advanceFrame trap the 68000 at the breakpoint', async () => {
    const backend = await createGenesisGpgxBackend()
    backend.loadMedia('bin', buildRom())
    expect(backend.getPC()).toBe(0x200)

    // The IDE passes a Set<number | BankBreakpoint>; a flat 68000 build is bare
    // numbers. advanceFrame returns 0 when a breakpoint trapped.
    backend.setBreakpoints(new Set([0x206]))
    const r = backend.advanceFrame()
    expect(r).toBe(0)
    expect(backend.getPC()).toBe(0x206)
    expect(backend.cpuState().d[0]).toBe(0x12345678) // breakpoint instr not yet run

    // Resume: steps past the parked breakpoint, re-traps next iteration.
    expect(backend.advanceFrame()).toBe(0)
    expect(backend.getPC()).toBe(0x206)
    expect(backend.cpuState().d[0]).toBe(0x12345679)

    // Cleared → runs free.
    backend.setBreakpoints(new Set())
    expect(backend.advanceFrame()).toBe(1)
    expect(backend.cpuState().d[0]).toBeGreaterThan(0x12345679)
  })

  it('tolerates BankBreakpoint objects in the address set', async () => {
    const backend = await createGenesisGpgxBackend()
    backend.loadMedia('bin', buildRom())
    // A {addr,space} entry must resolve to its addr, not collapse to 0/NaN.
    backend.setBreakpoints(new Set([{ addr: 0x206, space: 'bank0' }]))
    expect(backend.advanceFrame()).toBe(0)
    expect(backend.getPC()).toBe(0x206)
  })
})
