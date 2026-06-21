// C64 emulator backend — the chips `systems/c64.h` core (compiled to wasm via
// an Embind wrapper, see wasm/c64-core.cpp) behind the generic RunBackend
// contract. A thin shim like AltirraBackend: the core owns emulation, the host
// owns pixel/audio plumbing + the ROM hand-off.
//
// The Commodore KERNAL/BASIC/CHARGEN ROMs are Cloanto-copyright and are NOT
// shipped. We bundle the GPL-3 MEGA65 Open ROMs (roms/) and pass them to the
// core at init — the only place ROM bytes touch the emulator.

import { AudioPushPump } from '@core/audio'
import type { Cpu6502State, RunBackend } from '@ports'

import { createC64Core, c64WasmUrl } from '@madside/wasm-chips'
// GPL-3 Open ROMs — bundled as data assets, handed to the core at init.
import kernalUrl from './roms/kernal_generic.rom?url'
import basicUrl from './roms/basic_generic.rom?url'
import chargenUrl from './roms/chargen_openroms.rom?url'

// The Embind C64Core class (wasm/c64-core.cpp). All typed-array returns are
// views into wasm memory — copy before the next core call (memory growth
// detaches them).
interface C64CoreInstance {
  init(kernal: Uint8Array, basic: Uint8Array, chargen: Uint8Array): void
  reset(): void
  loadPRG(bytes: Uint8Array): boolean
  advanceFrame(): number
  step(): number
  setBreakpoints(addrs: number[]): void
  getPC(): number
  getA(): number
  getX(): number
  getY(): number
  getS(): number
  getP(): number
  isAtInstrBoundary(): boolean
  readMem(addr: number, len: number): Uint8Array
  keyDown(key: number): void
  keyUp(key: number): void
  pixels(): Uint32Array
  getAudioSamples(): Float32Array
  saveState(): Uint8Array
  loadState(bytes: Uint8Array): void
  readonly width: number
  readonly height: number
  readonly sampleRate: number
  delete(): void
}

interface C64Module {
  C64Core: new () => C64CoreInstance
}

const C64_WIDTH = 392
const C64_HEIGHT = 272
const C64_SAMPLE_RATE = 44100

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`chips C64: failed to fetch ROM ${url} (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

export class ChipsC64Backend implements RunBackend {
  readonly width = C64_WIDTH
  readonly height = C64_HEIGHT
  readonly sampleRate = C64_SAMPLE_RATE
  readonly pixels = new Uint32Array(C64_WIDTH * C64_HEIGHT)

  private readonly core: C64CoreInstance

  // SID audio tap. The core accumulates samples during exec; the pump drains
  // them to the worklet (same model as the Altirra POKEY / jsnes APU taps).
  private readonly audioPump = new AudioPushPump('chips-c64-audio', {
    sampleRate: C64_SAMPLE_RATE,
    pull: () => {
      const fresh = this.core.getAudioSamples()
      return fresh.length > 0 ? new Float32Array(fresh) : null
    },
  })

  constructor(core: C64CoreInstance) {
    this.core = core
  }

  /** Copy the core's framebuffer view into the owned pixel buffer (the view
   *  aliases wasm memory and detaches on growth). */
  private refreshPixels(): void {
    this.pixels.set(this.core.pixels())
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    if (format !== 'prg') {
      throw new Error(`ChipsC64Backend.loadMedia: unsupported format '${format}'`)
    }
    if (!this.core.loadPRG(bytes)) {
      throw new Error('ChipsC64Backend.loadMedia: c64_quickload rejected the .prg')
    }
    this.refreshPixels()
  }

  advanceFrame(): number {
    // The RunBackend `trap` arg is unused: breakpoints are pushed into the core
    // via setBreakpoints and trapped there (instruction-granular, no per-tick JS
    // roundtrip). The caller re-checks the hit via getPC()/isAtInstrBoundary().
    const ticks = this.core.advanceFrame()
    this.refreshPixels()
    return ticks
  }

  step(): number {
    const ticks = this.core.step()
    this.refreshPixels()
    return ticks
  }

  cpuState(): Cpu6502State {
    const p = this.core.getP()
    return {
      a: this.core.getA(),
      x: this.core.getX(),
      y: this.core.getY(),
      pc: this.core.getPC(),
      sp: this.core.getS(),
      // 6502 status bits: N V - B D I Z C (bit 5 unused).
      flags: {
        n: !!(p & 0x80),
        v: !!(p & 0x40),
        b: !!(p & 0x10),
        d: !!(p & 0x08),
        i: !!(p & 0x04),
        z: !!(p & 0x02),
        c: !!(p & 0x01),
      },
    }
  }

  getPC(): number {
    return this.core.getPC() & 0xffff
  }

  isAtInstrBoundary(): boolean {
    return this.core.isAtInstrBoundary()
  }

  readMem(addr: number, len: number, space = 'cpu'): Uint8Array {
    if (space !== 'cpu') throw new Error(`ChipsC64Backend.readMem: unknown space '${space}'`)
    // Copy out of the wasm-memory view before it can detach.
    return this.core.readMem(addr & 0xffff, len).slice()
  }

  setBreakpoints(addrs: Iterable<number>): void {
    this.core.setBreakpoints([...addrs].map((a) => a & 0xffff))
  }

  sendKey(keyCode: number, _charCode: number, isDown: boolean): void {
    // keyCode is the chips C64 key code, mapped from the browser key by
    // machine-c64.input.codeToKey.
    if (isDown) this.core.keyDown(keyCode)
    else this.core.keyUp(keyCode)
  }

  async startAudio(): Promise<void> {
    await this.audioPump.start()
  }

  async suspendAudio(): Promise<void> {
    await this.audioPump.suspend()
  }

  saveState(): unknown {
    // Copy out of the wasm view — the next core call reuses the scratch.
    return this.core.saveState().slice()
  }

  loadState(snapshot: unknown): void {
    this.core.loadState(new Uint8Array(snapshot as ArrayBufferLike))
    this.refreshPixels()
  }
}

let modulePromise: Promise<C64Module> | null = null
function loadModule(): Promise<C64Module> {
  if (modulePromise) return modulePromise
  modulePromise = createC64Core({ locateFile: () => c64WasmUrl }).then((mod) => mod as C64Module)
  return modulePromise
}

/** Backend factory matching RunBackendFactory. Loads the wasm module, fetches
 *  the GPL Open ROMs, and boots the core ready for frame-loop wiring. */
export async function createChipsC64Backend(): Promise<RunBackend> {
  const [mod, kernal, basic, chargen] = await Promise.all([
    loadModule(),
    fetchBytes(kernalUrl),
    fetchBytes(basicUrl),
    fetchBytes(chargenUrl),
  ])
  const core = new mod.C64Core()
  core.init(kernal, basic, chargen)
  return new ChipsC64Backend(core)
}
