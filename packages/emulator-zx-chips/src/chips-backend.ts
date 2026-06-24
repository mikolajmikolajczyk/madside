// ZX Spectrum 48K emulator backend — the chips `systems/zx.h` core (compiled to
// wasm via an Embind wrapper, see wasm/zx-core.cpp) behind the generic
// RunBackend contract. A near-copy of the C64 backend; the core owns emulation,
// the host owns pixel/audio plumbing + the ROM hand-off.
//
// The 48K ROM is Amstrad-redistributable and ships (roms/48.rom); we pass it to
// the core at init. The bootable format is the 48K .sna snapshot (chips has no
// tape API and its quickload is a .z80 loader; appmake emits .sna directly).

import { AudioPushPump } from '@core/audio'
import type { BankProjection, BankWindow, CpuZ80State, RunBackend } from '@ports'

import { createZxCore, zxWasmUrl } from '@madside/wasm-chips'
// Amstrad-redistributable ZX ROMs — bundled, handed to the core at init. The
// 48K image boots ZX_TYPE_48K; the two 128K images boot ZX_TYPE_128 (editor +
// 48K BASIC banks) for the zx128 machine.
import romUrl from './roms/48.rom?url'
import rom128_0Url from './roms/128-0.rom?url'
import rom128_1Url from './roms/128-1.rom?url'

// The Embind ZxCore class (wasm/zx-core.cpp). All typed-array returns are views
// into wasm memory — copy before the next core call (growth detaches them).
interface ZxCoreInstance {
  init(rom48k: Uint8Array): void
  init128(rom0: Uint8Array, rom1: Uint8Array): void
  /** Last $7FFD write — 128K paging latch (bits 0-2 = $C000 RAM bank). 0 on 48K. */
  getMemConfig(): number
  reset(): void
  loadSNA(bytes: Uint8Array): boolean
  /** Load a .z80 snapshot (v2/v3) — handles the 128K format: 8 RAM bank pages +
   *  $7FFD paging, so a banked 128K program lands with each bank in place. */
  loadZ80(bytes: Uint8Array): boolean
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
  // Switchable bank window declared by the 128K machine (ADR-0014). Empty for
  // the faithful 48K machine (no $7FFD paging) — bankMap() is then omitted.
  private readonly banks: readonly BankWindow[]

  // Beeper audio tap (same drain model as the C64 SID / Altirra POKEY taps).
  private readonly audioPump = new AudioPushPump('chips-zx-audio', {
    sampleRate: ZX_SAMPLE_RATE,
    pull: () => {
      const fresh = this.core.getAudioSamples()
      return fresh.length > 0 ? new Float32Array(fresh) : null
    },
  })

  constructor(core: ZxCoreInstance, banks: readonly BankWindow[] = []) {
    this.core = core
    this.banks = banks
  }

  private refreshPixels(): void {
    this.pixels.set(this.core.pixels())
  }

  bankMap(): BankProjection[] {
    // 128K only: the $7FFD latch (bits 0-2) selects the RAM bank paged into the
    // declared window ($C000-$FFFF). Write-only on the bus, so the live bank
    // comes from the core's tracked last_mem_config, not a register read.
    return this.banks.map((w) => {
      const bank = this.core.getMemConfig() & 0x07
      return {
        window: w.id,
        start: w.start,
        end: w.end,
        space: `${w.spacePrefix ?? 'bank'}${bank}`,
        bankOffset: bank * (w.end - w.start + 1),
      }
    })
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    // .z80 carries the 128K bank pages (the banked zx128 output); .sna is the 48K
    // path. Both restore full Z80 state + paging in the core.
    const ok = format === 'z80' ? this.core.loadZ80(bytes)
             : format === 'sna' ? this.core.loadSNA(bytes)
             : null
    if (ok === null) {
      throw new Error(`ChipsZxBackend.loadMedia: unsupported format '${format}' (expected 'sna' or 'z80')`)
    }
    if (!ok) {
      throw new Error(`ChipsZxBackend.loadMedia: ${format} snapshot rejected`)
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

/** Backend factory matching RunBackendFactory. The machine's bank windows
 *  (ADR-0014) pick the mode: the zx128 machine declares the $C000 window → boot
 *  ZX_TYPE_128 with the two 128K ROM banks + a live bankMap(); the 48K machine
 *  declares none → boot the faithful ZX_TYPE_48K with the single 48K ROM (no
 *  $7FFD paging, so a 48K program that hits the port does nothing). */
export async function createChipsZxBackend(banks?: readonly BankWindow[]): Promise<RunBackend> {
  const mod = await loadModule()
  const core = new mod.ZxCore()
  if (banks && banks.length > 0) {
    const [r0, r1] = await Promise.all([fetchBytes(rom128_0Url), fetchBytes(rom128_1Url)])
    core.init128(r0, r1)
    return new ChipsZxBackend(core, banks)
  }
  core.init(await fetchBytes(romUrl))
  return new ChipsZxBackend(core)
}
