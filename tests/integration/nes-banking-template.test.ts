// Runnable banked NES TEMPLATE proof (ADR-0014 Phase 2, #134). Joins both halves
// of NES banking on real tools/core: builds the actual nes-banking template with
// the real ca65 + ld65 (banked linker config), then runs the resulting ROM on the
// real jsnes core. Asserts the editor side (cc65 .dbg tags the two $8000 routines
// with banks 0/1) and the runtime side (the same $8000 breakpoint resolves to PRG
// bank 0 then bank 1 as execution flows) AGREE — a source-line breakpoint's bank
// matches the live bank the backend reports, which is what makes the breakpoint
// fire only in its bank.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim'
import { parseDbg } from '@madside/toolchain-ca65'
import { jsnesEmulator } from '@madside/emulator-nes-jsnes'
import { breakpointFires, resolvePcLoc, splitBreakpoints } from '@ports'
import { resolveBreakpoints } from '@ui/hooks'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const CC65 = (w: string) => repo(`packages/wasm-cc65/${w}`)
const TPL = 'apps/ide/templates/nes-banking/src/'

async function runWasi(wasmPath: string, args: string[], files: Map<string, File>): Promise<number> {
  const dir = new PreopenDirectory('.', files)
  const wasi = new WASI(args, [], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(() => {}),
    ConsoleStdout.lineBuffered(() => {}),
    dir,
  ])
  const inst = new WebAssembly.Instance(new WebAssembly.Module(await readFile(wasmPath)), {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
  try {
    wasi.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
  } catch (e) {
    return typeof e === 'object' && e && 'code' in e ? (e as { code: number }).code : 1
  }
  return 0
}

describe('NES banking template builds + runs + debugs end-to-end (ADR-0014 Phase 2)', () => {
  it('a source-line breakpoint bank matches the live bank, for the same $8000 in bank 0 then bank 1', async () => {
    const files = new Map<string, File>([
      ['main.s', new File(await readFile(repo(TPL + 'main.s')))],
      ['banked.cfg', new File(await readFile(repo(TPL + 'banked.cfg')))],
      ['main.o', new File([])],
      ['main.nes', new File([])],
      ['main.dbg', new File([])],
    ])
    expect(await runWasi(CC65('ca65.wasm'), ['ca65', '-g', 'main.s', '-o', 'main.o'], files)).toBe(0)
    expect(await runWasi(CC65('ld65.wasm'),
      ['ld65', '-C', 'banked.cfg', '--dbgfile', 'main.dbg', '-o', 'main.nes', 'main.o'], files)).toBe(0)

    // Editor side: the .dbg tags both $8000 routines with their bank.
    const { sourceMap } = parseDbg(new TextDecoder().decode(files.get('main.dbg')!.data), ['main.s'])
    const at8000 = sourceMap.bankedAddrToLoc?.get(0x8000)
    expect(at8000?.map((l) => l.space).sort()).toEqual(['bank0', 'bank1'])
    const b0Line = at8000!.find((l) => l.space === 'bank0')!.line
    const b1Line = at8000!.find((l) => l.space === 'bank1')!.line
    // A breakpoint on each source line resolves to its bank.
    expect([...resolveBreakpoints(sourceMap, new Map([['main.s', new Set([b0Line])]]))])
      .toContainEqual({ addr: 0x8000, space: 'bank0' })
    expect([...resolveBreakpoints(sourceMap, new Map([['main.s', new Set([b1Line])]]))])
      .toContainEqual({ addr: 0x8000, space: 'bank1' })

    // Runtime side: run the very same ROM on jsnes; the $8000 window switches
    // bank 0 → bank 1, and the source line for the live bank is the one that
    // would trap there.
    const rom = new Uint8Array(files.get('main.nes')!.data)
    const backend = await jsnesEmulator.createBackend()
    backend.loadMedia('nes', rom)

    const runToWindow = (): boolean => {
      backend.setBreakpoints([0x8000])
      const at = () => backend.isAtInstrBoundary() && backend.getPC() === 0x8000
      for (let i = 0; i < 200; i++) {
        backend.advanceFrame(at)
        if (at()) return true
      }
      return false
    }
    const liveSpace = () => {
      const map = backend.bankMap!()
      return breakpointFires(0x8000, splitBreakpoints([{ addr: 0x8000, space: 'bank0' }]), map)
        ? 'bank0'
        : breakpointFires(0x8000, splitBreakpoints([{ addr: 0x8000, space: 'bank1' }]), map)
          ? 'bank1'
          : null
    }

    // First $8000 stop: live bank 0, and the source line resolved there is b0Line.
    expect(runToWindow()).toBe(true)
    expect(liveSpace()).toBe('bank0')
    expect(resolvePcLoc(sourceMap, 0x8000, 'bank0')!.line).toBe(b0Line)

    // Flow to bank 1: live bank 1, source line b1Line.
    backend.step()
    expect(runToWindow()).toBe(true)
    expect(liveSpace()).toBe('bank1')
    expect(resolvePcLoc(sourceMap, 0x8000, 'bank1')!.line).toBe(b1Line)
  })
})
