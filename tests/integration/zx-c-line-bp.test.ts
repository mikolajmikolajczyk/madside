// Per-line breakpoints on ZX C (z88dk/sccz80). Two halves had to line up:
//  1. sccz80 must emit a C_LINE per *statement* (not per function) — `-debug-defc`
//     (z88dk-wasm). Default sccz80 is function-grained, so only the `int main`
//     line was breakpointable.
//  2. parseZ88dkCDebug must track the C_LINE file in the *listing*, where the
//     directive carries z80asm's line-number prefix (the C_LINE regex was missing
//     that → every .c-body line was misattributed → function-grained fallback).
// This pins per-line granularity: every executable statement line resolves to an
// address and the chips ZX core actually traps there.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z88dkToolchain } from '@madside/toolchain-z88dk'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'
import { resolveBreakpoints } from '@ui/hooks'
import { splitBreakpoints, breakpointFires } from '@ports'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
// Distinct statements on their own lines (2..6); line 7 spins, 8 is dead.
const SRC = [
  'int main(void) {',     // 1
  '  int a = 1;',          // 2
  '  int b = a + 2;',      // 3
  '  int c = b + 3;',      // 4
  '  int d = c + 4;',      // 5
  '  d = d + a;',          // 6
  '  for (;;) {}',         // 7
  '  return d;',           // 8
  '}',
].join('\n')

describe('ZX C per-line breakpoints (#136 / source-map)', () => {
  let original: typeof globalThis.fetch | undefined
  beforeAll(() => {
    original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('zx-core.wasm')) return new Response(await readFile(repo('packages/wasm-chips/zx-core.wasm')), { status: 200 })
      const m = url.match(/([\w-]+\.wasm)/)
      if (m) return new Response(await readFile(repo(`packages/wasm-z88dk/${m[1]}`)), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('zx-sysroot')) return new Response(await readFile(repo('packages/toolchain-z88dk/src/zx-sysroot.zip')), { status: 200, headers: { 'content-type': 'application/zip' } })
      if (url.endsWith('.rom')) { const n = url.slice(url.lastIndexOf('/') + 1); return new Response(await readFile(repo(`packages/emulator-zx-chips/src/roms/${n}`)), { status: 200 }) }
      if (original) return original(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (original) globalThis.fetch = original })

  it('maps every statement line and traps there in the core', async () => {
    const r = await z88dkToolchain.build({
      projectId: 'zx-c-line-bp', machine: 'zx-spectrum', main: 'src/main.c',
      files: [{ path: 'src/main.c', content: SRC }], options: {},
    })
    expect(r.ok, `build failed: ${r.stderr}`).toBe(true)
    const byLine = r.sourceMap!.locToAddr.get('src/main.c')!
    // Statement lines 2..6 each map (not just the function line) — per-line.
    for (const line of [2, 3, 4, 5, 6]) expect(byLine.get(line), `line ${line} unmapped`).toBeGreaterThan(0x4000)

    // Each reachable statement line actually traps via the IDE resolution path.
    for (const line of [2, 3, 4, 5, 6, 7]) {
      const bps = resolveBreakpoints(r.sourceMap!, new Map([['src/main.c', new Set([line])]]))
      const split = splitBreakpoints(bps)
      const be = await chipsZxEmulator.createBackend()
      be.loadMedia!('sna', r.binary!)
      be.setBreakpoints!(bps)
      const trap = () => be.isAtInstrBoundary!() && breakpointFires(be.getPC!(), split, be.bankMap?.())
      let fired = false
      for (let f = 0; f < 60; f++) { be.advanceFrame(trap); if (trap()) { fired = true; break } }
      expect(fired, `line ${line} did not trap`).toBe(true)
    }
  }, 120_000)
})
