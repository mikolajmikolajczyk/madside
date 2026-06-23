import type { Cpu68kState, RunBackend } from '@ports'
import { loadWasmModule } from '@core/vfs'
import { musashiWasmUrl } from '@madside/wasm-musashi'

// Genesis display (VDP H40 NTSC). No video yet — the framebuffer is blank until
// the VDP lands in Phase B; the CPU + memory contract is what Phase A validates.
const WIDTH = 320
const HEIGHT = 224
// 68000 @ ~7.670453 MHz / 60 fps.
const FRAME_CYCLES = 127841

// m68k_register_t indices (from Musashi's m68k.h).
const REG_D0 = 0
const REG_A0 = 8
const REG_PC = 16
const REG_SR = 17

/** The reactor's exported API (build/support/musashi/musashi-system.c). */
interface MusashiExports {
  memory: WebAssembly.Memory
  _initialize?: () => void
  init(): void
  load_rom(len: number): void
  reset(): void
  run_cycles(n: number): number
  get_reg(r: number): number
  read_byte(addr: number): number
  rom_ptr(): number
  rom_capacity(): number
  ram_ptr(): number
  ram_size(): number
}

async function instantiate(): Promise<MusashiExports> {
  const module = await loadWasmModule(musashiWasmUrl)
  // Reactor: stub whatever wasi imports the core asks for (libc paths it never
  // hits in a clean run) so instantiation succeeds without a full wasi shim.
  const imports: Record<string, Record<string, unknown>> = {}
  for (const imp of WebAssembly.Module.imports(module)) {
    ;(imports[imp.module] ??= {})[imp.name] =
      imp.kind === 'function' ? () => 0
        : imp.kind === 'memory' ? new WebAssembly.Memory({ initial: 256 })
          : imp.kind === 'global' ? new WebAssembly.Global({ value: 'i32', mutable: true }, 0)
            : 0
  }
  const instance = await WebAssembly.instantiate(module, imports as WebAssembly.Imports)
  const exports = instance.exports as unknown as MusashiExports
  exports._initialize?.()
  exports.init()
  return exports
}

export async function createGenesisMusashiBackend(): Promise<RunBackend> {
  const core = await instantiate()
  return new GenesisMusashiBackend(core)
}

class GenesisMusashiBackend implements RunBackend {
  readonly width = WIDTH
  readonly height = HEIGHT
  readonly pixels = new Uint32Array(WIDTH * HEIGHT) // blank until the VDP (Phase B)
  private breakpoints = new Set<number>()
  private readonly core: MusashiExports

  constructor(core: MusashiExports) {
    this.core = core
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    let rom = bytes
    if (format === 'smd') {
      // .smd = 512-byte header + 16K-block interleaved. De-interleave to a flat
      // image. (bin/md/gen are already flat.)
      rom = deinterleaveSmd(bytes)
    } else if (!['bin', 'md', 'gen'].includes(format)) {
      throw new Error(`GenesisMusashiBackend.loadMedia: unsupported format '${format}'`)
    }
    const cap = this.core.rom_capacity()
    const len = Math.min(rom.length, cap)
    new Uint8Array(this.core.memory.buffer, this.core.rom_ptr(), cap).set(rom.subarray(0, len))
    this.core.load_rom(len) // records length + pulses reset (fetches SSP/PC)
  }

  advanceFrame(trap?: () => boolean): number {
    // Fast path: no breakpoints/trap → run a whole frame in one call.
    if (this.breakpoints.size === 0 && !trap) return this.core.run_cycles(FRAME_CYCLES)
    // Debug path: step instruction-by-instruction so a breakpoint/trap stops on
    // an instruction boundary (24-bit PC — no 16-bit mask, #133).
    let used = 0
    while (used < FRAME_CYCLES) {
      used += this.core.run_cycles(1)
      const pc = this.getPC()
      if (this.breakpoints.has(pc)) break
      if (trap && trap()) break
    }
    return used
  }

  step(): number {
    return this.core.run_cycles(1)
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
    return true // Musashi always steps whole instructions.
  }

  readMem(addr: number, len: number, space = 'cpu'): Uint8Array {
    if (space !== 'cpu') throw new Error(`GenesisMusashiBackend.readMem: unknown space '${space}' (VDP spaces are Phase B)`)
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i++) out[i] = this.core.read_byte((addr + i) >>> 0) & 0xff
    return out
  }

  setBreakpoints(addrs: Iterable<number>): void {
    this.breakpoints = new Set([...addrs].map((a) => a >>> 0))
  }

  sendKey(): void {
    // Controller input is Phase B (no VDP/run loop wiring yet).
  }

  saveState(): unknown {
    const ram = new Uint8Array(this.core.memory.buffer, this.core.ram_ptr(), this.core.ram_size()).slice()
    return { ram, cpu: this.cpuState() }
  }

  loadState(snapshot: unknown): void {
    const s = snapshot as { ram?: Uint8Array } | null
    if (s?.ram) new Uint8Array(this.core.memory.buffer, this.core.ram_ptr(), this.core.ram_size()).set(s.ram)
    // Register restore needs a set_reg export — deferred to Phase B.
  }

  async startAudio(): Promise<void> {
    // No audio yet (Phase B: YM2612 + PSG).
  }

  async suspendAudio(): Promise<void> {}
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
