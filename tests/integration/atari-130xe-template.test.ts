// Runnable banked TEMPLATE proof (ADR-0014 Phase 1, #134). Builds the actual
// atari-130xe-bank template (real @BANK_ADD load-time bank loader, OPT B+ /
// LMB), boots the real Altirra core in 130XE mode, and watches the SAME $4000
// breakpoint distinguish bank 1 from bank 2 as execution flows main → bank 1 →
// trampoline → bank 2. This is the end-to-end the manual-staging bptrap test
// approximated, now driven by the genuine loader a user gets from the template.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { atariXl } from '@madside/machine-atari-xl'
import { breakpointFires, splitBreakpoints, type RunBackend } from '@ports'
import { altirraEmulator } from '@adapters/emu'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const MADS_WASM = repo('packages/wasm-mads/mads.wasm')
const ALTIRRA_WASM = repo('packages/wasm-altirra/altirra-core.wasm')
const TPL = 'apps/ide/templates/atari-130xe-bank/src/'

const setMem = (b: RunBackend, n: number) =>
  (b as unknown as { setMemoryMode(n: number): void }).setMemoryMode(n)

describe('Atari 130XE banked template runs + debugs end-to-end (ADR-0014)', () => {
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

  it('the same $4000 breakpoint resolves to bank 1, then bank 2, as the program flows between them', async () => {
    const file = async (n: string) => ({ path: 'src/' + n, content: await readFile(repo(TPL + n)) })
    const out = await madsToolchain.build({
      projectId: 'atari-130xe-bank',
      main: 'src/main.a65',
      files: [await file('main.a65'), await file('bankmac.a65')],
    })
    expect(out.ok, out.stderr).toBe(true)

    // The build tags both $4000 routines with their bank (bank-aware source map).
    const sm = out.sourceMap!
    expect(sm.bankedAddrToLoc?.get(0x4000)?.map((l) => l.space).sort()).toEqual(['bank1', 'bank2'])

    const backend = await altirraEmulator.createBackend(atariXl.banks)
    setMem(backend, 3) // 130XE
    backend.loadMedia('xex', out.binary!)

    // Stop the core the next time the PC reaches $4000.
    const runToWindow = (): boolean => {
      backend.setBreakpoints([0x4000])
      const at = () => backend.isAtInstrBoundary() && backend.getPC() === 0x4000
      for (let i = 0; i < 400; i++) {
        backend.advanceFrame(at)
        if (at()) return true
      }
      return false
    }
    const liveBankAt4000 = () => {
      const map = backend.bankMap!()
      return breakpointFires(0x4000, splitBreakpoints([{ addr: 0x4000, space: 'bank1' }]), map)
        ? 'bank1'
        : breakpointFires(0x4000, splitBreakpoints([{ addr: 0x4000, space: 'bank2' }]), map)
          ? 'bank2'
          : null
    }

    // First visit to $4000: bank 1 is live (main selected it).
    expect(runToWindow(), 'PC never reached $4000').toBe(true)
    expect(liveBankAt4000()).toBe('bank1')

    // Step past this instruction so the BP doesn't re-trip in place, then let the
    // program flow: bank 1 → trampoline → bank 2, stopping at $4000 again.
    backend.step()
    expect(runToWindow(), 'PC never returned to $4000 in bank 2').toBe(true)
    expect(liveBankAt4000()).toBe('bank2')
  }, 30_000)
})
