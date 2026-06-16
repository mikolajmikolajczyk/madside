// Public Atari emulator interface. UI / App code talk to this — never to a
// specific implementation. Future Altirra-wasm backend drops in by satisfying
// the same contract.

import type { Cpu6502State } from "@ports";

/** Altirra's CPU register snapshot — the shared 6502 shape. */
export type CpuRegs = Cpu6502State;

export interface EmuBackend {
  /** Visible canvas width × height; pixels are filled by the backend each frame. */
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;

  /** Hard-reset the machine (CPU + chips). */
  reset(): void;

  /** Generic media-load entrypoint. `format` is an opaque id matching the
   *  active MachinePlugin.media.formats. AltirraBackend ships
   *  'xex'/'atr'/'car'/'cas'; other backends declare their own. */
  loadMedia(format: string, bytes: Uint8Array): void;

  /** Convenience wrappers — Atari-specific shortcuts route through
   *  loadMedia internally; M6 DebugAdapter / NES plugin won't need these. */
  loadXEX(xex: Uint8Array): void;
  loadATR(atr: Uint8Array): void;
  loadCAR(car: Uint8Array): void;
  loadCAS(cas: Uint8Array): void;

  /** Hardware-config setters — numeric values match Altirra's ATHardwareMode
   *  / ATMemoryMode / Atari firmware-id enums. Apply before loading media. */
  setHardwareMode(mode: number): void;
  setMemoryMode(mode: number): void;
  setBasic(enabled: boolean): void;
  setKernel(firmwareId: number): void;

  /** Advance until next frame or until a breakpoint is hit. Returns cycles used. */
  advanceFrame(trap?: () => boolean): number;

  /** Replace the active breakpoint set. Backend stores as PC address set
   *  and traps at instruction boundary inside its own advance loop. */
  setBreakpoints(addrs: Iterable<number>): void;

  /** Advance exactly one 6502 instruction. Returns cycles consumed. */
  step(): number;

  /** Current CPU registers + flags. */
  cpuState(): CpuRegs;

  /** Current program counter — cheaper than `cpuState().pc` for hot loops. */
  getPC(): number;

  /** True when the CPU is at an instruction boundary (about to fetch next opcode). */
  isAtInstrBoundary(): boolean;

  /** Read `len` bytes starting at `addr` (16-bit wrap). No side effects. */
  readMem(addr: number, len: number): Uint8Array;

  /** Resume / start the audio sink (call from a user-gesture). */
  startAudio(): Promise<void>;

  /** Suspend the audio sink (e.g., on pause). */
  suspendAudio(): Promise<void>;

  /** Forward a browser keyboard event to the Atari keyboard. */
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers?: number): void;
}
