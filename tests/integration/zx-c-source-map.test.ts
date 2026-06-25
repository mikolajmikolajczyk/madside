// ZX C source-level debugging from the real z88dk C chain (#135). sccz80 emits
// `C_LINE` markers into its generated asm; z80asm's listing carries them and the
// link map gives absolute section bases + public symbols. parseZ88dkCDebug
// combines them into a SourceMap + labels, so sccz80-compiled C gets the same
// gutter addresses / source breakpoints / current-line as the asm path.
//
// Runs the FULL C toolchain (zcc → ucpp → zpragma → sccz80 → copt → z80asm →
// appmake) on a two-function program and asserts main.c lines map to addresses.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z88dkToolchain } from '@madside/toolchain-z88dk'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const WASM = (n: string) => repo(`packages/wasm-z88dk/${n}`)
const ZIP = repo('packages/toolchain-z88dk/src/zx-sysroot.zip')

// Two functions so there are two distinct C lines to map: add() opens at line 1,
// main() at line 5 (sccz80 emits a C_LINE per function at default optimisation).
const MAIN_C = `int add(int a, int b) {
  return a + b;
}

int main() {
  int x = add(5, 3);
  return x;
}
`

describe('ZX C source map from the real z88dk C chain (#135)', () => {
  let original: typeof globalThis.fetch | undefined
  beforeAll(() => {
    original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const m = url.match(/([\w-]+\.wasm)/)
      if (m) return new Response(await readFile(WASM(m[1])), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('zx-sysroot')) return new Response(await readFile(ZIP), { status: 200, headers: { 'content-type': 'application/zip' } })
      if (original) return original(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (original) globalThis.fetch = original })

  it('maps C source lines to addresses + extracts function symbols', async () => {
    const r = await z88dkToolchain.build({
      projectId: 'zx-c-src-map',
      machine: 'zx-spectrum',
      main: 'src/main.c',
      files: [{ path: 'src/main.c', content: MAIN_C }],
      options: {},
    })
    expect(r.ok, `build failed: ${r.stderr}`).toBe(true)
    expect(r.sourceMap, 'no source map').toBeDefined()
    expect(r.labels, 'no labels').toBeDefined()

    // Public symbols: sccz80 mangles C names with a leading underscore.
    const add = r.labels!.get('_add')
    const main = r.labels!.get('_main')
    expect(add, '_add symbol missing').toBeDefined()
    expect(main, '_main symbol missing').toBeDefined()
    // Both link into RAM above the +zx classic 0x8000 crt0 origin.
    expect(add!).toBeGreaterThanOrEqual(0x8000)
    expect(main!).toBeGreaterThan(add!) // main is compiled after add

    // C line → address, keyed back to the project path (resolved by basename
    // from the bare `main.c` the compiler references).
    const byLine = r.sourceMap!.locToAddr.get('src/main.c')
    expect(byLine, 'no line map for src/main.c').toBeDefined()
    expect(byLine!.get(1)).toBe(add) // add() body — function opens at line 1
    expect(byLine!.get(5)).toBe(main) // main() body — opens at line 5

    // addrToLoc round-trips the function entries back to main.c.
    expect(r.sourceMap!.addrToLoc.get(add!)).toEqual({ file: 'src/main.c', line: 1 })
    expect(r.sourceMap!.addrToLoc.get(main!)).toEqual({ file: 'src/main.c', line: 5 })
  }, 120_000)
})
