// Bank-aware debugging, end-to-end on the build + debug-logic side (ADR-0014
// Phase 1, #134). The running Altirra core is wasm — the repo runs real cores
// only for pure-JS jsnes — so this can't assert "the BP traps in the live core".
// It DOES assert the full chain that is testable headless:
//
//   real MADS banked build  →  source map captures (space, addr) across banks
//   →  resolveBreakpoints emits a BankBreakpoint for the banked line
//   →  breakpointFires fires it ONLY when the live bank matches
//   →  resolvePcLoc resolves the same address to the right line per live bank
//
// The live-bank projection is constructed here to match what the Altirra
// backend's bankMap() produces (decodeBankWindow is covered separately in
// altirra.bank.test.ts); importing the backend would drag the wasm core in.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { atariXl } from '@madside/machine-atari-xl'
import {
  breakpointFires,
  resolveLineSpace,
  resolvePcLoc,
  splitBreakpoints,
  type BankProjection,
  type SourceMap,
} from '@ports'
import { resolveBreakpoints } from '@ui/hooks'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const WASM_PATH = repo('packages/wasm-mads/mads.wasm')

// Two NOPs at the SAME window address $4000 in bank 1 and bank 2 — the 130XE
// ambiguity. `opt b+` = hardware banks over $4000–$7FFF; lmb/nmb set the bank;
// @BANK_ADD is the (here empty) user hook lmb/nmb call. main loops at $2000.
// (Bank 0 is MADS's implicit default — its .lst lines carry no bank prefix, so
// they resolve via addrToLoc first-wins; banks 1+ get an explicit `BB,` prefix
// and are the clean disambiguation case.)
const BANKED_SRC = `        opt b+
        .macro @BANK_ADD
        .endm
        org $4000
        lmb #1
b1nop   nop
        org $4000
        nmb
b2nop   nop
        org $2000
main    jmp main
        run main
`

const FILE = 'src/bank.a65'

// What the Altirra backend's bankMap() yields for a given live bank: the single
// $4000–$7FFF window mapped to `space` (or null when no ext bank is live).
const projection = (space: string | null): BankProjection[] => {
  const w = atariXl.banks![0]!
  return [{ window: w.id, start: w.start, end: w.end, space, bankOffset: 0 }]
}

describe('Atari 130XE bank-aware debugging (ADR-0014 Phase 1)', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('mads.wasm')) {
        const bytes = await readFile(WASM_PATH)
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })

  afterAll(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  let sm: SourceMap
  let b1Line: number
  let b2Line: number

  it('builds the banked program and captures both banks at the shared address', async () => {
    const out = await madsToolchain.build({
      projectId: 'atari-130xe-bank',
      main: FILE,
      files: [{ path: FILE, content: new TextEncoder().encode(BANKED_SRC) }],
    })
    expect(out.ok, out.stderr).toBe(true)
    expect(atariXl.media.detect(out.binary!)).toBe('xex')
    expect(out.sourceMap).toBeDefined()
    sm = out.sourceMap!

    // Both NOPs land at $4000 — addrToLoc keeps the first, bankedAddrToLoc both.
    const both = sm.bankedAddrToLoc?.get(0x4000)
    expect(both).toBeDefined()
    expect(both!.map((l) => l.space).sort()).toEqual(['bank1', 'bank2'])

    b1Line = both!.find((l) => l.space === 'bank1')!.line
    b2Line = both!.find((l) => l.space === 'bank2')!.line
    expect(b1Line).not.toBe(b2Line) // distinct source lines, same address
  })

  it('resolves each source line to its bank (resolveLineSpace)', () => {
    expect(resolveLineSpace(sm, FILE, b1Line)).toBe('bank1')
    expect(resolveLineSpace(sm, FILE, b2Line)).toBe('bank2')
  })

  it('emits a BankBreakpoint for a banked line (resolveBreakpoints)', () => {
    const bps = resolveBreakpoints(sm, new Map([[FILE, new Set([b2Line])]]))
    expect([...bps]).toEqual([{ addr: 0x4000, space: 'bank2' }])
  })

  it('fires the bank breakpoint ONLY when its bank is live', () => {
    const split = splitBreakpoints(resolveBreakpoints(sm, new Map([[FILE, new Set([b2Line])]])))
    expect(breakpointFires(0x4000, split, projection('bank2'))).toBe(true)  // live bank matches
    expect(breakpointFires(0x4000, split, projection('bank1'))).toBe(false) // wrong bank → resume
    expect(breakpointFires(0x4000, split, projection(null))).toBe(false)    // no ext bank mapped
  })

  it('resolves the current line to the right bank (resolvePcLoc)', () => {
    expect(resolvePcLoc(sm, 0x4000, 'bank1')!.line).toBe(b1Line)
    expect(resolvePcLoc(sm, 0x4000, 'bank2')!.line).toBe(b2Line)
    // No live bank → first-wins fallback (flat behavior).
    expect(resolvePcLoc(sm, 0x4000)!.line).toBe(sm.addrToLoc.get(0x4000)!.line)
  })
})
