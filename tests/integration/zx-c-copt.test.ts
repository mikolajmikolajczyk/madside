// z88dk C peephole (copt) regression guard (#105). copt was reverted to
// passthrough after #87 over a reported "drops i_N: label defs → link fails" on
// non-trivial sccz80 output. The real copt.wasm no longer reproduces that across
// loops / branches / && || / switch (it correctly emits `defc i_N = i_M` equates
// when collapsing co-located labels), so it's re-enabled. This pins it: build a
// loop+branch program through the FULL real chain (with copt), boot the .sna on
// the chips ZX core, and read a computed global back — proving copt both links
// and produces correct code.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z88dkToolchain } from '@madside/toolchain-z88dk'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))

// A loop with an if/else (multiple sccz80 `i_N` internal labels — the construct
// the regression hit) computing a known value into a global:
//   odds 1+3+5+7+9 = 25, minus 1 for each of the five evens = 20.
const MAIN_C = [
  'unsigned char result;',
  'int main() {',
  '  int acc = 0;',
  '  for (int i = 1; i <= 10; i++) {',
  '    if (i & 1) acc += i;',
  '    else acc -= 1;',
  '  }',
  '  result = (unsigned char)acc;',
  '  for (;;) {}',
  '  return 0;',
  '}',
].join('\n')

describe('z88dk C peephole (copt) links + runs (#105)', () => {
  let original: typeof globalThis.fetch | undefined
  beforeAll(() => {
    original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('zx-core.wasm')) return new Response(await readFile(repo('packages/wasm-chips/zx-core.wasm')), { status: 200 })
      const m = url.match(/([\w-]+\.wasm)/)
      if (m) return new Response(await readFile(repo(`packages/wasm-z88dk/${m[1]}`)), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('zx-sysroot')) return new Response(await readFile(repo('packages/toolchain-z88dk/src/zx-sysroot.zip')), { status: 200, headers: { 'content-type': 'application/zip' } })
      if (url.endsWith('.rom')) {
        const name = url.slice(url.lastIndexOf('/') + 1)
        return new Response(await readFile(repo(`packages/emulator-zx-chips/src/roms/${name}`)), { status: 200 })
      }
      if (original) return original(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (original) globalThis.fetch = original })

  it('assembles loop/branch C through copt and the global computes correctly', async () => {
    const r = await z88dkToolchain.build({
      projectId: 'zx-c-copt',
      machine: 'zx-spectrum',
      main: 'src/main.c',
      files: [{ path: 'src/main.c', content: MAIN_C }],
      options: {},
    })
    // The regression was a link failure ("undefined symbol: i_2") — so a clean
    // build with real copt (guarded) is the core assertion.
    expect(r.ok, `build failed: ${r.stderr}`).toBe(true)
    const resultAddr = r.labels!.get('_result')
    expect(resultAddr, '_result symbol missing').toBeGreaterThanOrEqual(0x4000)

    // Breakpoints still resolve on optimised output: main()'s C line maps to its
    // (copt-shifted) entry address, and that address round-trips back to the line.
    const mainAddr = r.labels!.get('_main')
    expect(r.sourceMap!.locToAddr.get('src/main.c')?.get(2)).toBe(mainAddr)
    expect(r.sourceMap!.addrToLoc.get(mainAddr!)).toEqual({ file: 'src/main.c', line: 2 })

    // Boot the produced .sna and let main() run; read the computed global back.
    const backend = await chipsZxEmulator.createBackend()
    backend.loadMedia('sna', r.binary!)
    for (let i = 0; i < 12; i++) backend.advanceFrame()
    const mem = backend.readMem!(resultAddr!, 1)
    expect(mem[0]).toBe(20)
  }, 120_000)
})
