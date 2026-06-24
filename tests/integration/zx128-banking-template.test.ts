// Runnable banked ZX128 TEMPLATE proof (ADR-0014, #134). Joins both halves of
// ZX128 banking on real tools + core: assembles the actual zx128-banking template
// with the real z80asm (BANK_n sections → per-section binaries), maps each
// section into its RAM bank + wraps a 128K .z80 (the toolchain's banked path),
// then runs it on the real chips 128K core. Asserts the editor side (z80asm
// BANK_n → bank-tagged source map) and the runtime side (chips $7FFD bankMap)
// AGREE: the same $C000 breakpoint resolves to RAM bank 1, then bank 3, as
// execution flows.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Directory } from '@bjorn3/browser_wasi_shim'
import { parseZ80asmDebug, buildZ80Snapshot } from '@madside/toolchain-z88dk'
import { machineZx128 } from '@madside/machine-zx'
import { chipsZxEmulator } from '@madside/emulator-zx-chips'
import { breakpointFires, resolvePcLoc, splitBreakpoints } from '@ports'
import { resolveBreakpoints } from '@ui/hooks'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const Z80ASM = repo('packages/wasm-z88dk/z80asm.wasm')
const ZX_WASM = repo('packages/wasm-chips/zx-core.wasm')
const ROM = (n: string) => repo(`packages/emulator-zx-chips/src/roms/${n}`)

const SECTION_HEAD = /^__(?:(.+)_)?head\s*=\s*\$([0-9A-Fa-f]+)/
const BANK_NAME = /^BANK_?(\d+)$/i

describe('ZX128 banking template builds + runs + debugs end-to-end (ADR-0014)', () => {
  it('the same $C000 breakpoint resolves to RAM bank 1, then bank 3, as the program pages between them', async () => {
    // --- assemble the actual template with z80asm (-b -l -m) ---
    // Mount under src/ exactly like the real toolchain: z80asm writes its
    // per-section binaries + list/map INTO the source's directory.
    const main = await readFile(repo('apps/ide/templates/zx128-banking/src/main.asm'))
    const srcDir = new Directory([['main.asm', new File(main)]] as [string, File][])
    const root = new PreopenDirectory('.', [['src', srcDir]] as [string, Directory][])
    const wasi = new WASI(['z80asm', '-b', '-l', '-m', '-mz80', 'src/main.asm'], [], [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered(() => {}),
      ConsoleStdout.lineBuffered(() => {}),
      root,
    ])
    const inst = new WebAssembly.Instance(new WebAssembly.Module(await readFile(Z80ASM)), {
      wasi_snapshot_preview1: wasi.wasiImport,
    })
    try {
      wasi.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
    } catch { /* proc_exit */ }

    const dec = new TextDecoder()
    const fileData = (name: string): Uint8Array =>
      (srcDir.contents.get(name) as File | undefined)?.data ?? new Uint8Array()
    const lis = dec.decode(fileData('main.lis'))
    const map = dec.decode(fileData('main.map'))

    // --- editor side: bank-tagged source map ---
    const { sourceMap } = parseZ80asmDebug(lis, map, ['src/main.asm'])
    const atC000 = sourceMap.bankedAddrToLoc?.get(0xc000)
    expect(atC000?.map((l) => l.space).sort()).toEqual(['bank1', 'bank3'])
    const b1Line = atC000!.find((l) => l.space === 'bank1')!.line
    const b3Line = atC000!.find((l) => l.space === 'bank3')!.line
    expect([...resolveBreakpoints(sourceMap, new Map([['src/main.asm', new Set([b1Line])]]))])
      .toContainEqual({ addr: 0xc000, space: 'bank1' })

    // --- toolchain banked path: section binaries → RAM banks → .z80 ---
    const heads = new Map<string, number>()
    for (const line of map.split('\n')) {
      const m = SECTION_HEAD.exec(line)
      if (m) heads.set(m[1] ?? '', parseInt(m[2], 16))
    }
    const banks = new Map<number, Uint8Array>()
    const place = (bank: number, off: number, bytes: Uint8Array): void => {
      let img = banks.get(bank)
      if (!img) { img = new Uint8Array(0x4000); banks.set(bank, img) }
      img.set(bytes.subarray(0, 0x4000 - off), off)
    }
    for (const name of srcDir.contents.keys()) {
      if (!name.startsWith('main_') || !name.endsWith('.bin')) continue
      const bytes = fileData(name)
      if (!bytes.length) continue
      const section = name.slice('main_'.length, -'.bin'.length)
      const head = heads.get(section) ?? 0
      const bm = BANK_NAME.exec(section)
      if (bm) place(parseInt(bm[1], 10), head - 0xc000, bytes)
      else if (head >= 0x8000 && head < 0xc000) place(2, head - 0x8000, bytes)
      else place(0, head - 0xc000, bytes)
    }
    const z80 = buildZ80Snapshot({ pc: 0x8000, port7ffd: 0, banks })

    // --- runtime: run the .z80 on the real 128K core ---
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('zx-core.wasm')) return new Response(await readFile(ZX_WASM), { status: 200 })
      if (url.endsWith('.rom')) return new Response(await readFile(ROM(url.slice(url.lastIndexOf('/') + 1))), { status: 200 })
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
    try {
      const backend = await chipsZxEmulator.createBackend(machineZx128.banks)
      backend.loadMedia('z80', z80)

      const runToWindow = (): boolean => {
        backend.setBreakpoints([0xc000])
        const at = () => backend.isAtInstrBoundary() && backend.getPC() === 0xc000
        for (let i = 0; i < 100; i++) { backend.advanceFrame(at); if (at()) return true }
        return false
      }
      const liveSpace = () => {
        const m = backend.bankMap!()
        return breakpointFires(0xc000, splitBreakpoints([{ addr: 0xc000, space: 'bank1' }]), m) ? 'bank1'
          : breakpointFires(0xc000, splitBreakpoints([{ addr: 0xc000, space: 'bank3' }]), m) ? 'bank3'
            : null
      }

      // First visit: RAM bank 1 paged, source line resolves to bank1_entry.
      expect(runToWindow()).toBe(true)
      expect(liveSpace()).toBe('bank1')
      expect(resolvePcLoc(sourceMap, 0xc000, 'bank1')!.line).toBe(b1Line)

      // Flow to bank 3.
      backend.step()
      expect(runToWindow()).toBe(true)
      expect(liveSpace()).toBe('bank3')
      expect(resolvePcLoc(sourceMap, 0xc000, 'bank3')!.line).toBe(b3Line)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
