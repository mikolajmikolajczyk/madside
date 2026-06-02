// Public Atari emulator interface. UI / App code talk to this — never to a
// specific implementation. Future Altirra-wasm backend drops in by satisfying
// the same contract.

export interface CpuRegs {
  a: number; x: number; y: number; pc: number; sp: number;
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean };
}

export interface EmuBackend {
  /** Visible canvas width × height; pixels are filled by the backend each frame. */
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;

  /** Hard-reset the machine (CPU + chips). */
  reset(): void;

  /** Load a `.xex` image and reset; audio buffers are flushed. */
  loadXEX(xex: Uint8Array): void;

  /** Advance until next frame or until a breakpoint is hit. Returns cycles used. */
  advanceFrame(trap?: () => boolean): number;

  /** Replace the active breakpoint set. Backend stores as PC address set
   *  and traps at instruction boundary inside its own advance loop. */
  setBreakpoints(addrs: Iterable<number>): void;

  /** Advance exactly one 6502 instruction. Returns cycles consumed. */
  step(): number;

  /** Render one display frame using current RAM/DLI without advancing the CPU.
   *  Useful while paused — refreshes pixels to reflect post-step memory. */
  frameRefresh(): void;

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
