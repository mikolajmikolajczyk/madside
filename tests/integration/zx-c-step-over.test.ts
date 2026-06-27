// "Step over" a library call on ZX C must run the call to completion and stop on
// the NEXT source line — not dive into the z88dk library. The z88dk C library is
// compiled from .c with C_LINE markers (fputc_callee.c, …); once parseZ88dkCDebug
// began tracking C_LINE correctly, those library lines started mapping, so a
// step-over of printf stopped inside fputc. The fix: the source map keeps only
// the project's own files, so library code reads as "no source" and step-over
// (which keeps running through unmapped PCs) passes straight through it.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z88dkToolchain } from '@madside/toolchain-z88dk'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'
import { resolveBreakpoints } from '@ui/hooks'
import { splitBreakpoints, breakpointFires } from '@ports'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const SRC = [
  '#include <stdio.h>',  // 1
  'int main(void) {',    // 2
  '  int x = 1;',        // 3
  '  printf("hi\\n");',   // 4  ← step over this
  '  x = x + 1;',        // 5  ← should land here
  '  for (;;) {}',       // 6
  '  return 0;',         // 7
  '}',
].join('\n')

describe('ZX C step-over runs through library calls (#136 / source-map)', () => {
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

  it('no library file is in the source map; step-over of printf lands on the next line', async () => {
    const r = await z88dkToolchain.build({
      projectId: 'zx-c-step', machine: 'zx-spectrum', main: 'src/main.c',
      files: [{ path: 'src/main.c', content: SRC }], options: {},
    })
    expect(r.ok, `build failed: ${r.stderr}`).toBe(true)
    // The map must contain ONLY the project file — no library .c (fputc_callee, …).
    for (const loc of r.sourceMap!.addrToLoc.values()) expect(loc.file).toBe('src/main.c')

    const byLine = r.sourceMap!.locToAddr.get('src/main.c')!
    const printfLine = 4, nextLine = 5
    const bps = resolveBreakpoints(r.sourceMap!, new Map([['src/main.c', new Set([printfLine])]]))
    const split = splitBreakpoints(bps)
    const be = await chipsZxEmulator.createBackend()
    be.loadMedia!('sna', r.binary!)

    // Run to the printf line.
    be.setBreakpoints!(bps)
    const atPrintf = () => be.isAtInstrBoundary!() && breakpointFires(be.getPC!(), split, be.bankMap?.())
    let reached = false
    for (let f = 0; f < 60; f++) { be.advanceFrame(atPrintf); if (atPrintf()) { reached = true; break } }
    expect(reached, 'never reached printf line').toBe(true)
    // Step over (mirrors DebugService.stepOver): step one instruction, then RUN
    // (frame-step, servicing interrupts) with the other lines' entries as
    // breakpoints. printf's ROM HALT is passed by the frame's interrupt, and the
    // nearest forward line — line 5 — traps. A single-step loop would hang here.
    const targets = new Set<number>()
    for (const [line, addr] of byLine) if (line !== printfLine) targets.add(addr)
    let pc = be.step()
    if (!targets.has(pc)) {
      be.setBreakpoints!([...targets])
      for (let i = 0; i < 600; i++) { pc = (be.advanceFrame(), be.getPC!()); if (targets.has(pc)) break }
    }
    expect(r.sourceMap!.addrToLoc.get(pc)?.line).toBe(nextLine)
    expect(pc).toBe(byLine.get(nextLine))
  }, 120_000)
})
