// NES emulator backend — jsnes core behind the generic RunBackend contract.
//
// Decision + accuracy baseline: Radicle issue b41098c. jsnes 2.1.0 scores
// 106/131 (81%) on AccuracyCoin — solid mid-tier, enough for homebrew samples
// + teaching; not hardware-reference. The EmulatorPlugin abstraction keeps the
// pick reversible (a Mesen-class wasm core can drop in behind this same
// contract later).
//
// Full backend (#4 closed the M9 skeleton gaps): framebuffer blit, AudioWorklet
// sink (onAudioSample → push pump → worklet), controller input (sendKey →
// buttonDown/Up), and a breakpoint-granular advance loop that mirrors jsnes's
// own frame() body cycle-for-cycle (incl. the OAM-DMA halt drain).

import type { BankBreakpoint, BankProjection, BankWindow, Cpu6502State, RunBackend } from '@ports'
import { AudioPushPump } from '@core/audio'
import { NES } from 'jsnes'
import type { NESWithInternals } from './jsnes-internals'

const NES_WIDTH = 256
const NES_HEIGHT = 240
/** jsnes default; the real APU runs at the audio-context rate. Wired through
 *  MachinePlugin.audio.sampleRate when the machine-nes plugin lands. */
const DEFAULT_SAMPLE_RATE = 44100


export class JsnesBackend implements RunBackend {
  readonly width = NES_WIDTH
  readonly height = NES_HEIGHT
  readonly sampleRate = DEFAULT_SAMPLE_RATE
  readonly pixels = new Uint32Array(NES_WIDTH * NES_HEIGHT)

  private readonly nes: NESWithInternals
  private readonly bp = new Set<number>()
  // Switchable PRG windows the machine declares (ADR-0014). NES mapper latches
  // are write-only, so the live bank can't be read off the bus; instead the
  // backend records it by wrapping the mapper's loadRomBank (installed in
  // loadMedia). Empty for a flat (NROM) machine config.
  private readonly banks: readonly BankWindow[]
  // Live PRG bank per window-start address ($8000 / $C000), updated by the
  // loadRomBank wrapper. The source of bankMap().
  private readonly liveBankAt = new Map<number, number>()
  // PC the last advanceFrame paused on — stepped over once on resume so Run
  // doesn't re-trap in place at the same breakpoint.
  private trappedAt: number | null = null

  // Audio sink (AudioWorklet). jsnes emits samples through onAudioSample during
  // frame(); they accumulate here and the push pump drains them to the worklet
  // (same model as the Altirra POKEY tap). ~0.7s at 44.1 kHz; on overrun (pump
  // stalled) the newest sample is dropped — inaudible vs a glitch.
  private readonly audioAccum = new Float32Array(1 << 15)
  private audioLen = 0
  // Pinned to the NES sample rate so jsnes's APU output feeds through without
  // resampling. Drains audioAccum each tick; the buffer transfers to the worklet.
  private readonly audioPump = new AudioPushPump('jsnes-audio', {
    sampleRate: this.sampleRate,
    pull: () => {
      if (this.audioLen === 0) return null
      const chunk = this.audioAccum.slice(0, this.audioLen)
      this.audioLen = 0
      return chunk
    },
  })

  constructor(banks: readonly BankWindow[] = []) {
    this.banks = banks
    this.nes = new NES({
      sampleRate: DEFAULT_SAMPLE_RATE,
      onFrame: (buffer: Uint32Array) => this.blit(buffer),
      // Mono-mix jsnes's stereo APU output into the audio buffer. NES audio is
      // mono; averaging L/R collapses jsnes's slight channel panning cleanly.
      onAudioSample: (left: number, right: number) => {
        if (this.audioLen < this.audioAccum.length) {
          this.audioAccum[this.audioLen++] = (left + right) * 0.5
        }
      },
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
    // Track the live PRG bank per window (ADR-0014). The mapper's latch is
    // write-only — it copies the selected bank into cpu.mem and discards the
    // number — so wrap loadRomBank to record it. The mapper instance only exists
    // after loadROM, and loadROM already did the power-on mapping before the wrap
    // could see it; re-run the mapper's own loadROM with the wrap installed to
    // capture the initial banks (idempotent remap, before any frame runs).
    this.liveBankAt.clear()
    const mmap2 = this.nes.mmap as (typeof this.nes.mmap & { loadROM?(): void }) | null
    if (this.banks.length > 0 && mmap2) {
      const orig = mmap2.loadRomBank.bind(mmap2)
      mmap2.loadRomBank = (bank: number, address: number): void => {
        this.liveBankAt.set(address, bank)
        orig(bank, address)
      }
      mmap2.loadROM?.()
    }
    // jsnes loads PC from the reset vector lazily — during the first emulate's
    // reset sequence — leaving getPC() at the power-on default until then. Seed
    // it now from $FFFC/$FFFD so the reset-entry instruction is observable to
    // the debugger; otherwise a BP on the program's very first instruction is
    // skipped (PC is never seen sitting on it). REG_PC is "one less than PC".
    const mmap = this.nes.mmap
    if (mmap) {
      const resetVec = mmap.load(0xfffc) | (mmap.load(0xfffd) << 8)
      this.nes.cpu.REG_PC = (resetVec - 1) & 0xffff
    }
    // Fresh program — clear any step-over carried from a previous run so a BP
    // on the entry still fires.
    this.trappedAt = null
  }

  /** Advance the machine by one loop iteration, byte-for-byte mirroring jsnes's
   *  own frame() body so our breakpoint-granular loop stays cycle-faithful:
   *  - normal: execute one instruction (PPU clocked inline in the bus ops),
   *    then clock the APU frame counter;
   *  - DMA/DMC halt owed: drain up to 8 halt cycles, stepping the PPU 3 dots
   *    per cycle instead of fetching the next opcode.
   *  Without the halt branch the PPU under-advances across OAM-DMA. */
  private stepInstruction(): number {
    const { cpu, ppu, papu } = this.nes
    if (cpu.cyclesToHalt === 0) {
      const cycles = cpu.emulate()
      papu.clockFrameCounter(cycles, cpu.apuCatchupCycles)
      cpu.apuCatchupCycles = 0
      return cycles
    }
    const chunk = Math.min(cpu.cyclesToHalt, 8)
    for (let i = 0; i < chunk; i++) ppu.advanceDots(3)
    papu.clockFrameCounter(chunk)
    cpu.cyclesToHalt -= chunk
    cpu._cpuCycleBase += chunk
    return chunk
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
    // Check the breakpoint set BEFORE executing each instruction, so a BP on
    // the instruction PC is about to run fires before it runs — including the
    // reset-entry instruction (PC sits on it after load, never "reached" via a
    // step). The exception is the instruction we paused ON last time: stepping
    // over it once lets Run resume past a BP instead of re-trapping in place.
    let pc = this.getPC()
    if (this.trappedAt !== pc && (this.bp.has(pc) || trap?.())) {
      this.trappedAt = pc
      return 0
    }
    this.trappedAt = null
    for (;;) {
      total += this.stepInstruction()
      if (ppu.frameEnded) {
        ppu.frameEnded = false
        break
      }
      pc = this.getPC()
      if (this.bp.has(pc) || trap?.()) {
        this.trappedAt = pc
        break
      }
    }
    return total
  }

  setBreakpoints(addrs: Iterable<number | BankBreakpoint>): void {
    // A bare number is a cpu-space PC breakpoint; a BankBreakpoint registers its
    // CPU addr (the bank match is host-side via bankMap(), ADR-0014).
    this.bp.clear()
    for (const a of addrs) this.bp.add((typeof a === 'number' ? a : a.addr) & 0xffff)
  }

  cpuState(): Cpu6502State {
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

  readMem(addr: number, len: number, space = 'cpu'): Uint8Array {
    // Extra spaces declared in machine-nes.memorySpaces. 'ppu' is the PPU's
    // own 16 KB address space (pattern tables / nametables / palette);
    // 'oam' is the 256-byte sprite attribute memory.
    if (space === 'ppu') {
      const vram = this.nes.ppu.vramMem
      const out = new Uint8Array(len)
      for (let i = 0; i < len; i++) out[i] = vram[(addr + i) & 0x3fff] ?? 0
      return out
    }
    if (space === 'oam') {
      const oam = this.nes.ppu.spriteMem
      const out = new Uint8Array(len)
      for (let i = 0; i < len; i++) out[i] = oam[(addr + i) & 0xff] ?? 0
      return out
    }
    if (space !== 'cpu') throw new Error(`JsnesBackend.readMem: unknown space '${space}'`)
    const out = new Uint8Array(len)
    const { mmap, cpu } = this.nes
    for (let i = 0; i < len; i++) {
      const a = (addr + i) & 0xffff
      out[i] = mmap ? mmap.load(a) & 0xff : cpu.mem[a]!
    }
    return out
  }

  bankMap(): BankProjection[] {
    // Project each declared PRG window to its live bank from the tracked latch
    // state (ADR-0014). NES selectors are write-only, so there's no register to
    // decode — the value comes from the loadRomBank wrapper. A window the mapper
    // never mapped (no entry) reports no bank.
    return this.banks.map((w) => {
      const bank = this.liveBankAt.get(w.start)
      const windowSize = w.end - w.start + 1
      return bank == null
        ? { window: w.id, start: w.start, end: w.end, space: null, bankOffset: null }
        : {
            window: w.id,
            start: w.start,
            end: w.end,
            space: `${w.spacePrefix ?? 'bank'}${bank}`,
            bankOffset: bank * windowSize,
          }
    })
  }

  sendKey(keyCode: number, _charCode: number, isDown: boolean): void {
    // keyCode is the jsnes Controller button index (0..7), mapped from the
    // browser key by machine-nes.input.codeToKey. Route to the player-1 pad.
    // (jsnes types the button as a 0..9 literal union; narrow the guarded int.)
    if (keyCode < 0 || keyCode > 7) return
    const btn = keyCode as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
    if (isDown) this.nes.buttonDown(1, btn)
    else this.nes.buttonUp(1, btn)
  }

  // The worklet sink is created lazily on first Run (needs a user gesture for
  // the AudioContext) and fed by a push pump draining the sample buffer —
  // shared with AltirraBackend via @core/audio (#10).
  async startAudio(): Promise<void> {
    await this.audioPump.start()
  }

  async suspendAudio(): Promise<void> {
    await this.audioPump.suspend()
    this.audioLen = 0
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
export async function createJsnesBackend(banks?: readonly BankWindow[]): Promise<RunBackend> {
  return new JsnesBackend(banks)
}
