// LIVE-CORE proof for 130XE bank reporting (ADR-0014 Phase 1, #134). The other
// banking tests are core-free (build + pure logic). This one boots the REAL
// Altirra wasm core in node (via a wasmBinary fetch shim — the core can't fetch
// a file:// URL itself) to close the one runtime assumption that code-review
// alone can't: that `readMem($D301)` returns the LIVE PIA PORTB, so the
// backend's bankMap() tracks the program's bank switches.
//
// A tiny program pokes PORTB's ext-bank bits; after it runs we assert bankMap()
// reflects the selected bank. This is the single link asserted "by construction"
// in atari-banking.test.ts — here it runs on the actual core.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { atariXl } from '@madside/machine-atari-xl'
import { altirraEmulator } from '@adapters/emu'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const MADS_WASM = repo('packages/wasm-mads/mads.wasm')
const ALTIRRA_WASM = repo('packages/wasm-altirra/altirra-core.wasm')

// Set PORTB ext-bank bits (2–3) to `bank` (0–3) with CPE (bit 4) = 0 so the CPU
// sees the ext bank, preserving bits 0/1 (OS ROM / BASIC) so the machine keeps
// running. `and #$e3` clears bits 2,3,4; `ora #(bank<<2)` selects the bank.
const pokeBankSrc = (bank: number) => `        org $2000
start
        lda $d301
        and #$e3
        ora #$${(bank << 2).toString(16).padStart(2, '0')}
        sta $d301
loop    jmp loop
        run start
`

describe('Atari 130XE live bankMap() on the real Altirra core (ADR-0014)', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('altirra-core.wasm')) {
        return new Response(await readFile(ALTIRRA_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (url.includes('mads.wasm')) {
        return new Response(await readFile(MADS_WASM), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })

  afterAll(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  const buildPoke = async (bank: number) => {
    const out = await madsToolchain.build({
      projectId: `portb-bank${bank}`,
      main: 'src/poke.a65',
      files: [{ path: 'src/poke.a65', content: new TextEncoder().encode(pokeBankSrc(bank)) }],
    })
    expect(out.ok, out.stderr).toBe(true)
    return out.binary!
  }

  // One bankMap() entry, the $4000–$7FFF window, with the selected bank live.
  const runAndReadBank = async (bank: number): Promise<string | null> => {
    const backend = await altirraEmulator.createBackend(atariXl.banks)
    backend.loadMedia('xex', await buildPoke(bank))
    for (let i = 0; i < 120; i++) backend.advanceFrame() // OS cold-boot + the poke
    expect(backend.bankMap).toBeDefined()
    const map = backend.bankMap!()
    expect(map).toHaveLength(1)
    expect(map[0]!.start).toBe(0x4000)
    return map[0]!.space
  }

  it('bankMap() reports bank1 after the program selects it via PORTB', async () => {
    expect(await runAndReadBank(1)).toBe('bank1')
  }, 30_000)

  it('bankMap() tracks a different selected bank (bank3)', async () => {
    expect(await runAndReadBank(3)).toBe('bank3')
  }, 30_000)
})
