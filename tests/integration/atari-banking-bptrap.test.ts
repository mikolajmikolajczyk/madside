// FULL LIVE BP-TRAP proof (ADR-0014 Phase 1, #134). Boots the real Altirra core
// in 130XE (128K) mode — where $4000–$7FFF genuinely banks (memoryMode 2 = 64K
// does NOT bank; verified) — copies distinct code into ext bank 1 and bank 2 at
// $4000, selects bank 1, and JMPs into the window so the PC actually executes
// inside a live ext bank. Then it drives the *real* Emulator trap path
// (splitBreakpoints + breakpointFires over the live bankMap()) and asserts a
// bank breakpoint at $4000 fires for bank 1 (live) but NOT bank 2 (wrong bank),
// while a plain cpu-space breakpoint fires regardless. This is the link the
// core-free tests assert by construction.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { atariXl } from '@madside/machine-atari-xl'
import { breakpointFires, splitBreakpoints } from '@ports'
import { altirraEmulator } from '@adapters/emu'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const MADS_WASM = repo('packages/wasm-mads/mads.wasm')
const ALTIRRA_WASM = repo('packages/wasm-altirra/altirra-core.wasm')

// kATMemoryMode_128K (130XE). memoryMode 2 = 64K does not bank — verified.
const MEM_128K = 3

// Manually stage two ext banks then run inside bank 1. PORTB ($D301): bits 2–3
// select the ext bank, bit 4 (CPE) = 0 enables CPU ext access; bits 0/1 (OS
// ROM / BASIC) preserved with `and #$e3`. Each bank gets `EA 4C 00 40` at $4000
// = NOP; JMP $4000 — an infinite loop whose PC sits at $4000. Then select bank 1
// and jump in, so the live bank under the PC is bank 1.
const STAGE_SRC = `        org $2000
        icl 'stage.inc'
init
        bsel 1
        stage
        bsel 2
        stage
        bsel 1
        jmp $4000
        run init
`
const STAGE_INC = `        .macro bsel bank
        lda $d301
        and #$e3
        ora #:bank<<2
        sta $d301
        .endm
        .macro stage
        lda #$ea
        sta $4000
        lda #$4c
        sta $4001
        lda #$00
        sta $4002
        lda #$40
        sta $4003
        .endm
`

describe('Atari 130XE live BP-trap: bank breakpoint fires only on the live bank (ADR-0014)', () => {
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

  it('traps a bank-1 breakpoint at $4000 but not a bank-2 one, with bank 1 live', async () => {
    const out = await madsToolchain.build({
      projectId: 'bank-bptrap',
      main: 'src/stage.a65',
      files: [
        { path: 'src/stage.a65', content: new TextEncoder().encode(STAGE_SRC) },
        { path: 'src/stage.inc', content: new TextEncoder().encode(STAGE_INC) },
      ],
    })
    expect(out.ok, out.stderr).toBe(true)

    const backend = await altirraEmulator.createBackend(atariXl.banks)
    // 130XE memory mode so $4000 actually banks (RunService applies this from
    // hardwareConfig in-app; set it directly here). Cast: setMemoryMode is an
    // Altirra extra, not on the RunBackend contract.
    ;(backend as unknown as { setMemoryMode(n: number): void }).setMemoryMode(MEM_128K)
    backend.loadMedia('xex', out.binary!)

    // Stop the core when the PC first reaches $4000 (now executing in bank 1).
    backend.setBreakpoints([0x4000])
    const atTarget = () => backend.isAtInstrBoundary() && backend.getPC() === 0x4000
    let landed = false
    for (let i = 0; i < 240 && !landed; i++) {
      backend.advanceFrame(atTarget)
      if (atTarget()) landed = true
    }
    expect(landed, 'PC never reached $4000 in the ext bank').toBe(true)

    // The live projection: $4000 window, bank 1 mapped.
    const map = backend.bankMap!()
    expect(map[0]!.space).toBe('bank1')

    // The real Emulator predicate, at the real PC, over the live bankMap:
    const pc = backend.getPC()
    const fires = (bp: Parameters<typeof splitBreakpoints>[0]) =>
      breakpointFires(pc, splitBreakpoints(bp), map)

    // Bank-1 breakpoint fires (live bank matches); bank-2 does not (wrong bank →
    // the run loop would resume); a plain cpu-space breakpoint fires regardless.
    expect(fires([{ addr: 0x4000, space: 'bank1' }])).toBe(true)
    expect(fires([{ addr: 0x4000, space: 'bank2' }])).toBe(false)
    expect(fires([0x4000])).toBe(true)
  }, 30_000)
})
