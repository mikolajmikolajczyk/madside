import type { Cpu68kState, RunBackend } from '@ports'
import { loadWasmModule } from '@core/vfs'
import { AudioPushPump } from '@core/audio'
import { gpgxWasmUrl } from '@madside/wasm-genesis-gpgx'

// Genesis Plus GX full-system backend (#145, Phase B): VDP video, YM2612/PSG
// audio, Z80 + I/O — driven through the wasm reactor harness
// (build/support/genesis-gpgx/genesis-gpgx-system.c). Reuses the m68k-debug
// adapter unchanged (gpgx embeds Musashi). The bare genesis-musashi backend
// stays as a headless fallback.

// NTSC H40 active display. The core's live viewport (fb_*) is copied into the
// top-left of this fixed buffer each frame; a display-off ROM reports a smaller
// viewport (e.g. 256×192) and the rest stays black.
const WIDTH = 320
const HEIGHT = 224
const SAMPLE_RATE = 44100

// m68k_register_t indices (gpgx core/m68k/m68k.h — same ordering as bare Musashi).
const REG_D0 = 0
const REG_A0 = 8
const REG_PC = 16
const REG_SR = 17

// Button index (machine-genesis.input.codeToKey) → gpgx INPUT_* pad bit.
const BUTTON_BITS = [
  0x0001, // 0 Up
  0x0002, // 1 Down
  0x0004, // 2 Left
  0x0008, // 3 Right
  0x0040, // 4 A
  0x0010, // 5 B
  0x0020, // 6 C
  0x0080, // 7 Start
]

/** The reactor's exported API (build/support/genesis-gpgx/genesis-gpgx-system.c). */
interface GpgxExports {
  memory: WebAssembly.Memory
  _initialize?: () => void
  init(): void
  rom_ptr(): number
  rom_capacity(): number
  load_rom_buffer(len: number): number
  reset(): void
  run_frame(): void
  framebuffer(): number
  fb_width(): number
  fb_height(): number
  fb_pitch(): number
  fb_x(): number
  fb_y(): number
  get_reg(r: number): number
  read_byte(addr: number): number
  audio_ptr(): number
  audio_update(): number
  set_input(port: number, buttons: number): void
}

async function instantiate(): Promise<GpgxExports> {
  const module = await loadWasmModule(gpgxWasmUrl)
  // Reactor wasi stubs. The core touches fopen (CD auto-detect) before falling
  // through to the in-memory ROM path — fd_prestat_get must report EBADF (8) so
  // wasilibc stops scanning preopens instead of trusting a bogus stub, letting
  // fopen return NULL cleanly. proc_exit must trap rather than silently no-op.
  const WASI_EBADF = 8
  const stub = (name: string): (() => number) =>
    name === 'proc_exit'
      ? () => { throw new Error('gpgx: unexpected wasi proc_exit') }
      : name === 'fd_prestat_get' || name === 'fd_prestat_dir_name'
        ? () => WASI_EBADF
        : () => 0
  const imports: Record<string, Record<string, unknown>> = {}
  for (const imp of WebAssembly.Module.imports(module)) {
    ;(imports[imp.module] ??= {})[imp.name] =
      imp.kind === 'function' ? stub(imp.name)
        : imp.kind === 'memory' ? new WebAssembly.Memory({ initial: 512 })
          : imp.kind === 'global' ? new WebAssembly.Global({ value: 'i32', mutable: true }, 0)
            : 0
  }
  const instance = await WebAssembly.instantiate(module, imports as WebAssembly.Imports)
  const exports = instance.exports as unknown as GpgxExports
  exports._initialize?.()
  exports.init()
  return exports
}

export async function createGenesisGpgxBackend(): Promise<RunBackend> {
  const core = await instantiate()
  return new GenesisGpgxBackend(core)
}

class GenesisGpgxBackend implements RunBackend {
  readonly width = WIDTH
  readonly height = HEIGHT
  readonly sampleRate = SAMPLE_RATE
  readonly pixels = new Uint32Array(WIDTH * HEIGHT) // 0xAARRGGBB (xrgb8888)
  private breakpoints = new Set<number>()
  private padState = 0
  private loaded = false
  private readonly core: GpgxExports

  // Mono downmix of the YM2612/PSG stereo output, drained to the worklet.
  private audioQueue: number[] = []
  private readonly audioPump = new AudioPushPump('gpgx-genesis-audio', {
    sampleRate: SAMPLE_RATE,
    pull: () => {
      if (this.audioQueue.length === 0) return null
      const out = Float32Array.from(this.audioQueue)
      this.audioQueue = []
      return out
    },
  })

  constructor(core: GpgxExports) {
    this.core = core
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    let rom = bytes
    if (format === 'smd') {
      rom = deinterleaveSmd(bytes)
    } else if (!['bin', 'md', 'gen'].includes(format)) {
      throw new Error(`GenesisGpgxBackend.loadMedia: unsupported format '${format}'`)
    }
    const cap = this.core.rom_capacity()
    const len = Math.min(rom.length, cap)
    new Uint8Array(this.core.memory.buffer, this.core.rom_ptr(), cap).set(rom.subarray(0, len))
    const ok = this.core.load_rom_buffer(len)
    if (!ok) throw new Error('GenesisGpgxBackend.loadMedia: gpgx rejected the ROM')
    this.loaded = true
    this.refreshPixels()
  }

  /** Copy the live VDP viewport into the top-left of the owned pixel buffer.
   *  Re-derives the wasm view each call (memory growth detaches it). */
  private refreshPixels(): void {
    if (!this.loaded) return
    const base = this.core.framebuffer() >>> 2 // uint32 index
    const pitch32 = this.core.fb_pitch() >>> 2
    const vx = this.core.fb_x()
    const vy = this.core.fb_y()
    const vw = Math.min(this.core.fb_width(), WIDTH)
    const vh = Math.min(this.core.fb_height(), HEIGHT)
    const src = new Uint32Array(this.core.memory.buffer)
    const dst = this.pixels
    for (let y = 0; y < vh; y++) {
      const srcRow = base + (vy + y) * pitch32 + vx
      const dstRow = y * WIDTH
      for (let x = 0; x < vw; x++) dst[dstRow + x] = src[srcRow + x]!
    }
  }

  /** Drain one frame of YM2612/PSG audio, downmixed to mono float [-1,1). */
  private pumpAudio(): void {
    const frames = this.core.audio_update()
    if (frames <= 0) return
    const base = this.core.audio_ptr() >>> 1 // int16 index
    const buf = new Int16Array(this.core.memory.buffer)
    for (let i = 0; i < frames; i++) {
      const l = buf[base + i * 2]!
      const r = buf[base + i * 2 + 1]!
      this.audioQueue.push((l + r) / 65536) // (L+R)/2 / 32768
    }
  }

  advanceFrame(trap?: () => boolean): number {
    // gpgx is frame-scheduled — no sub-frame instruction stepping. With
    // breakpoints/trap active, check at the frame boundary (instruction-granular
    // single-step is the bare-Musashi backend's job; line-debug here is a Phase-B
    // follow-up that needs M68K_INSTRUCTION_HOOK).
    this.core.run_frame()
    this.refreshPixels()
    this.pumpAudio()
    if (this.breakpoints.has(this.getPC())) return 0
    if (trap) trap()
    return 1
  }

  step(): number {
    // No instruction-granular step yet (needs the m68k instruction hook); advance
    // a whole frame so the UI's Step still makes progress.
    return this.advanceFrame()
  }

  cpuState(): Cpu68kState {
    const d: number[] = []
    const a: number[] = []
    for (let i = 0; i < 8; i++) d.push(this.core.get_reg(REG_D0 + i) >>> 0)
    for (let i = 0; i < 8; i++) a.push(this.core.get_reg(REG_A0 + i) >>> 0)
    return { d, a, pc: this.core.get_reg(REG_PC) >>> 0, sr: this.core.get_reg(REG_SR) & 0xffff }
  }

  getPC(): number {
    return this.core.get_reg(REG_PC) >>> 0
  }

  isAtInstrBoundary(): boolean {
    return true // frame boundary == instruction boundary (no mid-frame stepping)
  }

  readMem(addr: number, len: number, space = 'cpu'): Uint8Array {
    if (space !== 'cpu') {
      throw new Error(`GenesisGpgxBackend.readMem: unknown space '${space}' (VDP-space reads are a Phase-B follow-up)`)
    }
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i++) out[i] = this.core.read_byte((addr + i) >>> 0) & 0xff
    return out
  }

  setBreakpoints(addrs: Iterable<number>): void {
    this.breakpoints = new Set([...addrs].map((a) => a >>> 0))
  }

  sendKey(keyCode: number, _charCode: number, isDown: boolean): void {
    // keyCode is the machine-genesis button index (0..7), mapped from the browser
    // key by machine-genesis.input.codeToKey. Route to the player-1 pad.
    if (keyCode < 0 || keyCode >= BUTTON_BITS.length) return
    const bit = BUTTON_BITS[keyCode]!
    this.padState = isDown ? this.padState | bit : this.padState & ~bit
    this.core.set_input(0, this.padState)
  }

  saveState(): unknown {
    // A full gpgx snapshot needs state.c (state_save/state_load) wired through a
    // buffer export — deferred to a Phase-B follow-up. CPU regs only for now.
    return { cpu: this.cpuState() }
  }

  loadState(): void {
    // Paired with saveState — needs the state.c buffer export (Phase-B follow-up).
  }

  async startAudio(): Promise<void> {
    await this.audioPump.start()
  }

  async suspendAudio(): Promise<void> {
    await this.audioPump.suspend()
  }
}

/** De-interleave a .smd ROM: drop the 512-byte header, then for each 16K block
 *  the odd bytes are the second half and the even bytes the first half. */
function deinterleaveSmd(bytes: Uint8Array): Uint8Array {
  const body = bytes.subarray(512)
  const out = new Uint8Array(body.length)
  const BLOCK = 0x4000
  for (let base = 0; base < body.length; base += BLOCK) {
    const block = body.subarray(base, base + BLOCK)
    const half = block.length >> 1
    for (let i = 0; i < half; i++) {
      out[base + i * 2 + 1] = block[i] ?? 0
      out[base + i * 2] = block[half + i] ?? 0
    }
  }
  return out
}
