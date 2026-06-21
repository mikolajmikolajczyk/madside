// ZX Spectrum 48K emulator backend — the chips `systems/zx.h` core (compiled to
// wasm via an Embind wrapper, see wasm/zx-core.cpp) behind the generic
// RunBackend contract. A near-copy of the C64 backend; the core owns emulation,
// the host owns pixel/audio plumbing + the ROM hand-off.
//
// The 48K ROM is Amstrad-redistributable and ships (roms/48.rom); we pass it to
// the core at init. The bootable format is the 48K .sna snapshot (chips has no
// tape API and its quickload is a .z80 loader; appmake emits .sna directly).

import { AudioPushPump } from '@core/audio'
import type { CpuZ80State, RunBackend } from '@ports'

import { createZxCore, zxWasmUrl } from '@madside/wasm-chips'
// Amstrad-redistributable ZX 48K ROM — bundled, handed to the core at init.
import romUrl from './roms/48.rom?url'

// The Embind ZxCore class (wasm/zx-core.cpp). All typed-array returns are views
// into wasm memory — copy before the next core call (growth detaches them).
interface ZxCoreInstance {
  init(rom48k: Uint8Array): void
  reset(): void
  loadSNA(bytes: Uint8Array): boolean
  advanceFrame(): number
  step(): number
  setBreakpoints(addrs: number[]): void
  getPC(): number
  getAF(): number
  getBC(): number
  getDE(): number
  getHL(): number
  getIX(): number
  getIY(): number
  getSP(): number
  getIR(): number
  getAF2(): number
  getBC2(): number
  getDE2(): number
  getHL2(): number
  getIM(): number
  getIFF1(): boolean
  getIFF2(): boolean
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

interface ZxModule {
  ZxCore: new () => ZxCoreInstance
}

const ZX_WIDTH = 320
const ZX_HEIGHT = 256
const ZX_SAMPLE_RATE = 44100

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`chips ZX: failed to fetch ROM ${url} (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

export class ChipsZxBackend implements RunBackend {
  readonly width = ZX_WIDTH
  readonly height = ZX_HEIGHT
  readonly sampleRate = ZX_SAMPLE_RATE
  readonly pixels = new Uint32Array(ZX_WIDTH * ZX_HEIGHT)

  private readonly core: ZxCoreInstance

  // Beeper audio tap (same drain model as the C64 SID / Altirra POKEY taps).
  private readonly audioPump = new AudioPushPump('chips-zx-audio', {
    sampleRate: ZX_SAMPLE_RATE,
    pull: () => {
      const fresh = this.core.getAudioSamples()
      return fresh.length > 0 ? new Float32Array(fresh) : null
    },
  })

  constructor(core: ZxCoreInstance) {
    this.core = core
  }

  private refreshPixels(): void {
    this.pixels.set(this.core.pixels())
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    if (format !== 'sna') {
      throw new Error(`ChipsZxBackend.loadMedia: unsupported format '${format}' (expected 'sna')`)
    }
    if (!this.core.loadSNA(bytes)) {
      throw new Error('ChipsZxBackend.loadMedia: .sna snapshot rejected (need a 48K .sna)')
    }
    this.refreshPixels()
  }

  advanceFrame(): number {
    const ticks = this.core.advanceFrame()
    this.refreshPixels()
    return ticks
  }

  step(): number {
    const ticks = this.core.step()
    this.refreshPixels()
    return ticks
  }

  cpuState(): CpuZ80State {
    const af = this.core.getAF()
    const f = af & 0xff
    // Z80 flag byte: S Z - H - P/V N C (bits 7..0).
    return {
      pc: this.core.getPC(),
      sp: this.core.getSP(),
      af,
      bc: this.core.getBC(),
      de: this.core.getDE(),
      hl: this.core.getHL(),
      ix: this.core.getIX(),
      iy: this.core.getIY(),
      ir: this.core.getIR(),
      af2: this.core.getAF2(),
      bc2: this.core.getBC2(),
      de2: this.core.getDE2(),
      hl2: this.core.getHL2(),
      im: this.core.getIM(),
      iff1: this.core.getIFF1(),
      iff2: this.core.getIFF2(),
      flags: {
        s: !!(f & 0x80),
        z: !!(f & 0x40),
        h: !!(f & 0x10),
        pv: !!(f & 0x04),
        n: !!(f & 0x02),
        c: !!(f & 0x01),
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
    if (space !== 'cpu') throw new Error(`ChipsZxBackend.readMem: unknown space '${space}'`)
    return this.core.readMem(addr & 0xffff, len).slice()
  }

  setBreakpoints(addrs: Iterable<number>): void {
    this.core.setBreakpoints([...addrs].map((a) => a & 0xffff))
  }

  sendKey(keyCode: number, _charCode: number, isDown: boolean): void {
    // keyCode is the chips ZX key code, mapped from the browser key by
    // machine-zx.input.codeToKey.
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
    return this.core.saveState().slice()
  }

  loadState(snapshot: unknown): void {
    this.core.loadState(new Uint8Array(snapshot as ArrayBufferLike))
    this.refreshPixels()
  }
}

let modulePromise: Promise<ZxModule> | null = null
function loadModule(): Promise<ZxModule> {
  if (modulePromise) return modulePromise
  modulePromise = createZxCore({ locateFile: () => zxWasmUrl }).then((mod) => mod as ZxModule)
  return modulePromise
}

/** Backend factory matching RunBackendFactory. Loads the wasm module, fetches
 *  the bundled 48K ROM, and boots the core ready for frame-loop wiring. */
export async function createChipsZxBackend(): Promise<RunBackend> {
  const [mod, rom] = await Promise.all([loadModule(), fetchBytes(romUrl)])
  const core = new mod.ZxCore()
  core.init(rom)
  return new ChipsZxBackend(core)
}
