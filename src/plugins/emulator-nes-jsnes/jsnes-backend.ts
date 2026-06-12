// NES emulator backend — jsnes core behind the generic RunBackend contract.
//
// Decision + accuracy baseline: Radicle issue b41098c. jsnes 2.1.0 scores
// 106/131 (81%) on AccuracyCoin — solid mid-tier, enough for homebrew samples
// + teaching; not hardware-reference. The EmulatorPlugin abstraction keeps the
// pick reversible (a Mesen-class wasm core can drop in behind this same
// contract later).
//
// SKELETON STATUS (M9 / v0.8.0): structure + the verified jsnes API mapping
// are real and compile. Items still stubbed are tagged TODO(skeleton): exact
// framebuffer colour conversion, AudioWorklet wiring, controller input. The
// per-instruction breakpoint loop (the one genuinely tricky bit) is
// implemented here so the hard part isn't hand-waved.

import type { RunBackend } from '@ports'
import { NES } from 'jsnes'
import type { NESWithInternals } from './jsnes-internals'

const NES_WIDTH = 256
const NES_HEIGHT = 240
/** jsnes default; the real APU runs at the audio-context rate. Wired through
 *  MachinePlugin.audio.sampleRate when the machine-nes plugin lands. */
const DEFAULT_SAMPLE_RATE = 44100

/** Register snapshot in the shape the MOS6502 debug adapter expects — the
 *  same struct AltirraBackend.cpuState() returns, so debug-atari-6502's
 *  attach() (MOS6502_REGISTERS/FLAGS) is reusable for NES verbatim. */
export interface NesCpuState {
  a: number
  x: number
  y: number
  pc: number
  sp: number
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean }
}

export class JsnesBackend implements RunBackend {
  readonly width = NES_WIDTH
  readonly height = NES_HEIGHT
  readonly sampleRate = DEFAULT_SAMPLE_RATE
  readonly pixels = new Uint32Array(NES_WIDTH * NES_HEIGHT)

  private readonly nes: NESWithInternals
  private readonly bp = new Set<number>()

  constructor() {
    this.nes = new NES({
      sampleRate: DEFAULT_SAMPLE_RATE,
      onFrame: (buffer: Uint32Array) => this.blit(buffer),
      // TODO(skeleton): route to the AudioWorklet sink (mirror the Altirra
      // POKEY tap path in @adapters/emu).
      onAudioSample: () => undefined,
    }) as NESWithInternals
  }

  /** jsnes hands us 0x00RRGGBB; canvas-native (little-endian RGBA) wants
   *  0xAABBGGRR. Swap R/B and force alpha. */
  private blit(buffer: Uint32Array): void {
    const out = this.pixels
    for (let i = 0; i < out.length; i++) {
      const v = buffer[i]!
      out[i] = 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)
    }
  }

  loadMedia(format: string, bytes: Uint8Array): void {
    if (format !== 'nes') {
      throw new Error(`JsnesBackend.loadMedia: unsupported format '${format}'`)
    }
    this.nes.loadROM(bytes)
  }

  /** Run one CPU instruction. PPU advances inline inside the bus operations;
   *  we additionally clock the APU frame counter to match jsnes's own loop. */
  private stepInstruction(): number {
    const { cpu, papu } = this.nes
    const cycles = cpu.emulate()
    papu.clockFrameCounter(cycles, cpu.apuCatchupCycles)
    cpu.apuCatchupCycles = 0
    // TODO(frame-parity): drain cpu.cyclesToHalt via ppu.advanceDots(3) for
    // exact OAM-DMA stall timing. Omitting it slightly under-advances the PPU
    // during sprite DMA — irrelevant for step-debugging basic homebrew, but
    // matters for cycle-counted DMC tricks. See README "frame-loop parity".
    return cycles
  }

  step(): number {
    return this.stepInstruction()
  }

  advanceFrame(trap?: () => boolean): number {
    // Fast path: no debugging → jsnes's own loop, which is DMA-correct and
    // does the odd-frame / scanline bookkeeping. We only reimplement the loop
    // when a trap or breakpoint requires per-instruction granularity.
    if (!trap && this.bp.size === 0) {
      this.nes.frame()
      return 0
    }
    const { ppu } = this.nes
    this.nes.controllers[1].clock()
    this.nes.controllers[2].clock()
    ppu.startFrame()
    let total = 0
    for (;;) {
      total += this.stepInstruction()
      if (ppu.frameEnded) {
        ppu.frameEnded = false
        break
      }
      if (trap?.()) break
      if (this.bp.has(this.getPC())) break
    }
    return total
  }

  setBreakpoints(addrs: Iterable<number>): void {
    this.bp.clear()
    for (const a of addrs) this.bp.add(a & 0xffff)
  }

  cpuState(): NesCpuState {
    const c = this.nes.cpu
    return {
      a: c.REG_ACC,
      x: c.REG_X,
      y: c.REG_Y,
      pc: (c.REG_PC + 1) & 0xffff,
      sp: c.REG_SP & 0xff,
      flags: {
        n: !!c.F_SIGN,
        v: !!c.F_OVERFLOW,
        b: !!c.F_BRK,
        d: !!c.F_DECIMAL, // 2A03 has no decimal mode, but the bit is tracked
        i: !!c.F_INTERRUPT,
        z: !!c.F_ZERO,
        c: !!c.F_CARRY,
      },
    }
  }

  getPC(): number {
    return (this.nes.cpu.REG_PC + 1) & 0xffff
  }

  isAtInstrBoundary(): boolean {
    // We only ever step whole instructions (jsnes has no sub-instruction
    // resume), so the CPU is always at a boundary when paused.
    return true
  }

  readMem(addr: number, len: number): Uint8Array {
    const out = new Uint8Array(len)
    const { mmap, cpu } = this.nes
    for (let i = 0; i < len; i++) {
      const a = (addr + i) & 0xffff
      out[i] = mmap ? mmap.load(a) & 0xff : cpu.mem[a]!
    }
    return out
  }

  sendKey(): void {
    // TODO(skeleton): map keyCode → jsnes Controller buttons via
    // nes.buttonDown/buttonUp. Input mapping is a MachinePlugin.input concern
    // (machine-nes plugin), not part of the emulator-core pick.
  }

  saveState(): unknown {
    return this.nes.toJSON()
  }

  loadState(snapshot: unknown): void {
    this.nes.fromJSON(snapshot as ReturnType<NES['toJSON']>)
  }
}

/** Backend factory matching RunBackendFactory. Async to mirror the wasm-core
 *  factories (Altirra) even though jsnes boots synchronously. */
export async function createJsnesBackend(): Promise<RunBackend> {
  return new JsnesBackend()
}
