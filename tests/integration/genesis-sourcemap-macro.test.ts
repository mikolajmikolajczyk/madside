// clownassembler source map across macro + rept expansions (#146). The listing
// collapses each expansion to one line, so the line↔address lockstep holds; this
// pins that (a) a macro invocation line is mapped to its address (breakpointable
// call site), and (b) lines *after* an expansion don't drift.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'

const CLOWN = fileURLToPath(new URL('../../packages/wasm-clownassembler/clownassembler.wasm', import.meta.url))

// Lines (1-indexed): 1 dc.l, 2 dc.l, 3 macro def, 4 body move.l, 5 body nop,
// 6 endm, 7 start:, 8 move.l #1, 9 mymac invocation, 10 move.l #2, 11 rept,
// 12 nop, 13 endr, 14 move.l #3, 15 loop:, 16 bra.
const SRC = `	dc.l	$00FFFFFC
	dc.l	start
mymac: macro
	move.l	#\\1,d0
	nop
	endm
start:
	move.l	#1,d1
	mymac	$CAFE
	move.l	#2,d2
	rept 3
	nop
	endr
	move.l	#3,d3
loop:
	bra	loop
`

describe('clownassembler source map — macro / rept (#146)', () => {
  let of: typeof globalThis.fetch | undefined
  beforeAll(() => {
    of = globalThis.fetch
    globalThis.fetch = (async (i: RequestInfo | URL) => {
      const u = typeof i === 'string' ? i : i instanceof URL ? i.href : i.url
      if (u.includes('clownassembler.wasm')) {
        return new Response(await readFile(CLOWN), { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (of) return of(i)
      throw new Error('unmocked ' + u)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (of) globalThis.fetch = of })

  it('maps the macro call site and stays aligned past macro + rept', async () => {
    const built = await clownassemblerToolchain.build({
      projectId: 'sm',
      main: 'src/main.asm',
      files: [{ path: 'src/main.asm', content: new TextEncoder().encode(SRC) }],
    })
    expect(built.ok, built.stderr).toBe(true)
    const byLine = built.sourceMap!.locToAddr.get('src/main.asm')!

    expect(byLine.get(8)).toBe(0x08)  // move.l #1,d1
    // Macro invocation (line 9) is mapped to where its expansion begins ($E),
    // even though the listing shows no inline bytes for it.
    expect(byLine.get(9)).toBe(0x0e)
    expect(built.sourceMap!.addrToLoc.get(0x0e)).toEqual({ file: 'src/main.asm', line: 9 })

    // No drift after the macro: the next instruction is past the 8-byte body.
    expect(byLine.get(10)).toBe(0x16)  // move.l #2,d2
    // No drift after the rept: the move.l after `endr` lands past the 3 nops.
    expect(byLine.get(14)).toBe(0x22)  // move.l #3,d3
    expect(byLine.get(16)).toBe(0x28)  // bra loop
  })
})
