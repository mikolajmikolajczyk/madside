// ZX source-level debugging from real z80asm (#87, ADR-0014 groundwork). The
// z88dk toolchain previously ran `z80asm -b` only — ZX had no source map at all
// (no gutter addresses, no source breakpoints, no current-line). This runs the
// real z80asm with -l (list) + -m (map) over the zx-asm-hello template and
// checks parseZ80asmDebug turns them into a SourceMap + labels, giving ZX (48K +
// 128K) the same source-level debugging as the cc65 / MADS toolchains.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim'
import { parseZ80asmDebug } from '@madside/toolchain-z88dk'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const Z80ASM = repo('packages/wasm-z88dk/z80asm.wasm')
const TPL = 'apps/ide/templates/zx-asm-hello/src/'

async function asmListMap(source: string): Promise<{ lis: string; map: string }> {
  const files = new Map<string, File>([
    ['p.asm', new File(new TextEncoder().encode(source))],
    ['p.bin', new File([])],
    ['p.lis', new File([])],
    ['p.map', new File([])],
  ])
  const wasi = new WASI(['z80asm', '-b', '-l', '-m', '-mz80', 'p.asm'], [], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(() => {}),
    ConsoleStdout.lineBuffered(() => {}),
    new PreopenDirectory('.', files),
  ])
  const inst = new WebAssembly.Instance(new WebAssembly.Module(await readFile(Z80ASM)), {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
  try {
    wasi.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
  } catch { /* proc_exit */ }
  const dec = new TextDecoder()
  return { lis: dec.decode(files.get('p.lis')!.data), map: dec.decode(files.get('p.map')!.data) }
}

describe('ZX source map from real z80asm list + map (#87)', () => {
  it('builds line↔addr + labels from -l/-m, keyed back to project paths', async () => {
    const files = new Map<string, File>([
      ['main.asm', new File(await readFile(repo(TPL + 'main.asm')))],
      ['zx.inc', new File(await readFile(repo(TPL + 'zx.inc')))],
      ['main.bin', new File([])],
      ['main.lis', new File([])],
      ['main.map', new File([])],
    ])
    const dir = new PreopenDirectory('.', files)
    const wasi = new WASI(['z80asm', '-b', '-l', '-m', '-mz80', 'main.asm'], [], [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered(() => {}),
      ConsoleStdout.lineBuffered(() => {}),
      dir,
    ])
    const inst = new WebAssembly.Instance(new WebAssembly.Module(await readFile(Z80ASM)), {
      wasi_snapshot_preview1: wasi.wasiImport,
    })
    let code = 0
    try {
      wasi.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
    } catch (e) {
      code = typeof e === 'object' && e && 'code' in e ? (e as { code: number }).code : 1
    }
    expect(code).toBe(0)

    const dec = new TextDecoder()
    const lis = dec.decode(files.get('main.lis')!.data)
    const map = dec.decode(files.get('main.map')!.data)

    // projectFiles use src/ paths; the list refers to them by basename.
    const { sourceMap, labels } = parseZ80asmDebug(lis, map, ['src/main.asm', 'src/zx.inc'])

    // The program ORGs at $8000; `start:` (line 14) labels the first instruction
    // (`di`, line 15), which emits at $8000.
    expect(labels.get('start')).toBe(0x8000)
    expect(labels.get('draw_char')).toBe(0x8025)

    // Line→addr keyed by the resolved project path: the first emitting line maps
    // to $8000, and addrToLoc round-trips it.
    const m = sourceMap.locToAddr.get('src/main.asm')!
    expect(m.get(15)).toBe(0x8000) // `di`
    expect(sourceMap.addrToLoc.get(0x8000)).toEqual({ file: 'src/main.asm', line: 15 })

    // Later instruction addresses advance monotonically from the org.
    expect(m.get(17)).toBe(0x8001) // `ld a,1`
    expect(m.get(18)).toBe(0x8003) // `out (ULA_PORT),a`
  })

  it('tags BANK_n sections so same-$C000 lines in different banks are distinguished (ADR-0014)', async () => {
    // 128K banking convention: code that runs in the $C000 window under $7FFD
    // bank N lives in a section named BANK_N. Two such sections share $C000.
    const { lis, map } = await asmListMap(
      `    SECTION MAIN
    org $8000
main:
    nop
    SECTION BANK_3
    org $c000
b3:
    ld a,3
    SECTION BANK_5
    org $c000
b5:
    ld a,5
`,
    )
    const { sourceMap } = parseZ80asmDebug(lis, map, ['src/p.asm'])

    // Both BANK sections org at $C000 → same address, different banks, kept apart.
    const at = sourceMap.bankedAddrToLoc?.get(0xc000)
    expect(at?.map((l) => l.space).sort()).toEqual(['bank3', 'bank5'])
    // The flat MAIN section's line stays unbanked.
    expect(sourceMap.addrToLoc.get(0x8000)?.space).toBeUndefined()
  })
})
