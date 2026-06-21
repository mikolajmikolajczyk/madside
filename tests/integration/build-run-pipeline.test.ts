// Cross-service workflow integration (#68). Two genuine gaps the contract +
// existing integration suites don't cover:
//
//  1. Atari build pipeline — manifest(machine=atari-xl, toolchain=mads) → MADS
//     build → format detection → RunService.load → run → frames. nes-audio
//     proves this for jsnes; nothing chained build→load→run for Atari. The
//     emulator core is stubbed (Altirra is wasm; the repo runs real cores only
//     for pure-JS jsnes), so this asserts the *wiring*, not Altirra accuracy.
//  2. Machine-switch state isolation — run the Atari core, switch to NES, and
//     assert the runtime FSM resets and the old backend is discarded.
//     machine-selection.test.ts checks the swap + subscriber notify but NOT
//     that run state is cleared.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { madsToolchain } from '@madside/toolchain-mads'
import { atariXl } from '@madside/machine-atari-xl'
import { createWorkbench } from '@app/createWorkbench'
import { createMemoryStorage } from '@adapters/storage-memory'
import { createNoopLogger } from '@adapters/logger'
import type { RunBackend } from '@ports'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const WASM_PATH = repo('packages/wasm-mads/mads.wasm')
const SRC = 'apps/ide/templates/atari-hello/src/'

const enc = new TextEncoder()
const srcFile = async (name: string) => ({
  path: 'src/' + name,
  content: enc.encode(await readFile(repo(SRC + name), 'utf8')),
})

// A backend that records what RunService routes to it — the loads (format +
// bytes) and the number of frames advanced — so the test can assert the chain
// reached it without a real emulator core.
interface RecordingBackend extends RunBackend {
  loads: { format: string; bytes: Uint8Array }[]
  frames: number
}
function recordingBackend(): RecordingBackend {
  const w = atariXl.display.width
  const h = atariXl.display.height
  const be: RecordingBackend = {
    width: w,
    height: h,
    sampleRate: atariXl.audio.sampleRate,
    pixels: new Uint32Array(w * h),
    loads: [],
    frames: 0,
    loadMedia(format, bytes) { be.loads.push({ format, bytes }) },
    advanceFrame() { be.frames += 1; return be.frames },
    step: () => 0,
    cpuState: () => ({}),
    getPC: () => 0,
    isAtInstrBoundary: () => true,
    readMem: () => new Uint8Array(),
    setBreakpoints: () => undefined,
    sendKey: () => undefined,
    saveState: () => null,
    loadState: () => undefined,
    startAudio: async () => {},
    suspendAudio: async () => {},
  }
  return be
}

describe('build → load → run pipeline (Atari)', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    // Node can't serve the Vite `?url` wasm asset — shim fetch to read mads.wasm
    // off disk (same harness as nes-audio.test.ts).
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

  it('builds atari-hello with MADS, detects the XEX, and routes it through RunService', async () => {
    const out = await madsToolchain.build({
      projectId: 'atari-hello',
      main: 'src/hello.a65',
      files: [await srcFile('hello.a65'), await srcFile('atari.a65')],
    })
    expect(out.ok, out.stderr).toBe(true)
    expect(out.binary).toBeInstanceOf(Uint8Array)

    // Cross-service: the toolchain's output is a binary the *machine* recognises
    // as a bootable Atari executable (XEX magic `$ff $ff`). Neither side knows
    // about the other — the manifest's machine+toolchain pairing makes it work.
    expect(atariXl.media.detect(out.binary!)).toBe('xex')

    const backend = recordingBackend()
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      emuBackendFactory: async () => backend,
    })
    expect(wb.machine.id).toBe('atari-xl')

    // load() with no explicit format → RunService resolves it through the active
    // machine's media.detect, then dispatches to backend.loadMedia.
    const res = await wb.run.load(out.binary!)
    expect(res.ok).toBe(true)
    expect(wb.run.status).toBe('loaded')
    expect(backend.loads).toHaveLength(1)
    expect(backend.loads[0]!.format).toBe('xex')
    expect(backend.loads[0]!.bytes).toBe(out.binary)

    // run → advance: the chain reaches the emulator and produces frames.
    wb.run.run()
    expect(wb.run.status).toBe('running')
    const be = wb.run.backend()!
    for (let i = 0; i < 3; i++) be.advanceFrame()
    expect(backend.frames).toBeGreaterThanOrEqual(1)
  })
})

describe('machine-switch state isolation', () => {
  // Minimal valid XEX (magic `$ff $ff`, load $0600-$0602: a lone RTS) — enough
  // for media.detect + the stub; no build needed for this gap.
  const XEX = new Uint8Array([0xff, 0xff, 0x00, 0x06, 0x02, 0x06, 0x60])

  it('drops the running Atari backend + resets the FSM when switching to NES', async () => {
    const atari = recordingBackend()
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
      // Override applies to atari-xl only; NES boots the real jsnes core.
      emuBackendFactory: async () => atari,
    })

    // Arm + run the Atari core for a few frames so it carries live run state.
    const loaded = await wb.run.load(XEX)
    expect(loaded.ok).toBe(true)
    wb.run.run()
    const be = wb.run.backend()!
    for (let i = 0; i < 5; i++) be.advanceFrame()
    expect(atari.frames).toBe(5)
    expect(wb.run.backend()).toBe(atari)
    expect(wb.run.status).toBe('running')

    // Switch machine. reconfigure() must tear the running session down — these
    // two assertions are the gap machine-selection.test.ts leaves open.
    wb.setActiveMachine('nes')
    expect(wb.machine.id).toBe('nes')
    expect(wb.run.status).toBe('idle')       // runtime FSM reset, not left 'running'
    expect(wb.run.backend()).toBeNull()      // the Atari core is discarded, not reused

    // The next boot builds a fresh, real NES core — a different instance that
    // never saw the Atari run. No state can leak across the swap.
    const nes = await wb.run.boot()
    expect(nes).not.toBe(atari)
    expect(nes.width).toBe(256)
    expect(nes.height).toBe(240)
    expect(wb.run.backend()).toBe(nes)
  })
})
