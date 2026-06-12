// Typed view of the jsnes internals this backend depends on.
//
// jsnes ships a `nes.d.ts` that types the *public* NES surface (frame,
// loadROM, buttonDown, toJSON, …) but not `nes.cpu` / `nes.ppu` / `nes.papu`,
// which are plain-JS objects accessed at runtime. A debugger needs those
// internals (register file, single-instruction step, raw memory, PPU state),
// so we declare exactly the fields we touch here and cast through this view.
//
// WARNING — internals are not a stable API. They are stable *for a pinned
// jsnes version* (we pin 2.1.0). On a jsnes bump, re-verify every field below
// against the new source, and re-check the advanceFrame loop in jsnes-backend
// against jsnes's own `frame()` (src/nes.js).

import type { NES } from 'jsnes'

/** 6502 / 2A03 core. `REG_PC` follows jsnes's "one less than the real PC"
 *  convention — read the live PC as `REG_PC + 1`. */
export interface JsnesCpu {
  /** Full 64 KB address space as the CPU sees it (RAM + open bus scratch). */
  mem: Uint8Array
  REG_ACC: number
  REG_X: number
  REG_Y: number
  REG_PC: number
  REG_SP: number
  // Status flags are kept as separate fields (1/0), not a packed byte.
  F_CARRY: number
  F_ZERO: number
  F_INTERRUPT: number
  F_DECIMAL: number
  F_BRK: number
  F_OVERFLOW: number
  F_SIGN: number
  /** OAM-DMA / DMC stall cycles owed to the bus. frame() drains these before
   *  fetching the next opcode. */
  cyclesToHalt: number
  /** APU catch-up cycles already advanced inline; passed to
   *  papu.clockFrameCounter so it doesn't double-count. */
  apuCatchupCycles: number
  /** Execute exactly one instruction; returns cycles consumed. PPU is clocked
   *  inline inside the bus operations (load/write/push/pull). */
  emulate(): number
}

/** PPU. Only the frame-driving + viewer-surface fields are declared; the
 *  PPU viewer panel (M9 issue 93c218b) widens this with nameTable / ptTile /
 *  imgPalette / sprPalette when it lands. */
export interface JsnesPpu {
  /** VRAM (nametables + palette). */
  vramMem: Uint8Array
  /** OAM (sprite attribute memory). */
  spriteMem: Uint8Array
  /** Set true by the inline PPU stepping when VBlank fires; the frame loop
   *  reads + clears it to know the frame is done. */
  frameEnded: boolean
  startFrame(): void
  /** Advance the PPU by `dots` (3 per CPU cycle). Used to drain DMA-halt
   *  cycles in the frame loop. */
  advanceDots(dots: number): void
}

export interface JsnesPapu {
  /** Clock the APU frame counter by `cycles`, subtracting any `catchup`
   *  already advanced inline. */
  clockFrameCounter(cycles: number, catchup?: number): void
}

export interface JsnesMmap {
  /** Mapped read — honours cartridge / IO mapping (unlike raw cpu.mem). */
  load(addr: number): number
  write(addr: number, value: number): void
}

export interface JsnesController {
  clock(): void
}

/** The runtime shape of an NES instance with the internals we reach into. */
export type NESWithInternals = NES & {
  cpu: JsnesCpu
  ppu: JsnesPpu
  papu: JsnesPapu
  mmap: JsnesMmap | null
  controllers: Record<1 | 2, JsnesController>
}
