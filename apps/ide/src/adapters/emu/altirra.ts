// Altirra wasm-core backend. Lazy-loads the Emscripten ES module from
// `./wasm/altirra-core.js` (Vite-tracked), instantiates the C++ `AltirraCore` class,
// and forwards all `RunBackend` calls into it.
//
// Compared with the 8bw backend (now retired) this is a thin shim: the
// heavy lifting lives in the wasm core (Altirra by Avery Lee), and the
// host only owns the pixel/audio plumbing.

import { AudioPushPump } from "@core/audio";
import type { BankBreakpoint, BankProjection, BankWindow, RunBackend } from "@ports";
import type { CpuRegs } from "./backend";

interface AltirraCoreInstance {
  reset(): void;
  loadXEX(bytes: Uint8Array): boolean;
  loadATR(bytes: Uint8Array): boolean;
  loadCAR(bytes: Uint8Array): boolean;
  loadCAS(bytes: Uint8Array): boolean;
  setHardwareMode(mode: number): void;
  setMemoryMode(mode: number): void;
  setBasic(enabled: boolean): void;
  setKernel(firmwareId: number): void;
  advanceFrame(trap?: (() => boolean) | null): number;
  setBreakpoints(addrs: number[]): void;
  step(): number;
  frameRefresh(): void;
  getAudioSamples(): Float32Array;
  getPC(): number;
  getA(): number;
  getX(): number;
  getY(): number;
  getS(): number;
  getP(): number;
  isAtInstrBoundary(): boolean;
  readMem(addr: number, len: number): Uint8Array;
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers: number): void;
  pixels(): Uint32Array;
  saveState(): unknown;
  loadState(snapshot: unknown): void;
  readonly width: number;
  readonly height: number;
  readonly sampleRate: number;
  delete(): void;
}

interface AltirraModule {
  AltirraCore: new () => AltirraCoreInstance;
  getExceptionMessage?: (excPtr: number) => string;
}

// Vite hashes both files at build time. The factory is the default export of
// the emscripten ESM glue; the .wasm sibling is imported as a URL so we can
// hand it to locateFile() — Emscripten otherwise tries to resolve the wasm
// relative to import.meta.url, which the bundler scrambles.
import { createAltirraCore, altirraWasmUrl } from "@madside/wasm-altirra";

let modulePromise: Promise<AltirraModule> | null = null;
let modulePromiseRef: AltirraModule | null = null;
function loadModule(): Promise<AltirraModule> {
  if (modulePromise) return modulePromise;
  const p: Promise<AltirraModule> = createAltirraCore({
    locateFile: () => altirraWasmUrl,
  }).then((mod) => {
    const typed = mod as AltirraModule;
    modulePromiseRef = typed;
    return typed;
  });
  modulePromise = p;
  return p;
}

/** Pure decode of a bank window against a selector-register byte (ADR-0014).
 *  Split out so the projection is unit-testable without the wasm core. Returns
 *  the live `(space, bankOffset)` for the window, or a null projection when the
 *  window has no selector or its enable gate is closed (main RAM mapped). */
export function decodeBankWindow(w: BankWindow, regByte: number): BankProjection {
  const sel = w.selector;
  const flat: BankProjection = { window: w.id, start: w.start, end: w.end, space: null, bankOffset: null };
  if (!sel) return flat;
  if (sel.enableMask != null && (regByte & sel.enableMask) !== (sel.enableValue ?? 0)) return flat;
  const bank = (regByte & sel.mask) >> sel.shift;
  const windowSize = w.end - w.start + 1;
  return {
    window: w.id,
    start: w.start,
    end: w.end,
    space: `${w.spacePrefix ?? "bank"}${bank}`,
    bankOffset: bank * windowSize,
  };
}

export class AltirraBackend implements RunBackend {
  static async create(banks: readonly BankWindow[] = []): Promise<AltirraBackend> {
    const mod = await loadModule();
    const core = new mod.AltirraCore();
    return new AltirraBackend(core, banks);
  }

  private core: AltirraCoreInstance;
  // Switchable bank windows declared by the machine (ADR-0014). Empty for the
  // flat 800XL config; the 130XE config carries the $4000–$7FFF window.
  private readonly banks: readonly BankWindow[];
  readonly width: number;
  readonly height: number;
  readonly sampleRate: number;
  pixels: Uint32Array;

  private constructor(core: AltirraCoreInstance, banks: readonly BankWindow[]) {
    this.core = core;
    this.banks = banks;
    this.width = core.width;
    this.height = core.height;
    this.sampleRate = core.sampleRate;
    // Allocate a stable host-side buffer; per-frame copy happens in
    // advanceFrame via `this.refreshPixels()`.
    this.pixels = new Uint32Array(this.width * this.height);
  }

  loadMedia(format: string, bytes: Uint8Array) {
    const fn = format === 'xex' ? this.core.loadXEX
             : format === 'atr' ? this.core.loadATR
             : format === 'car' ? this.core.loadCAR
             : format === 'cas' ? this.core.loadCAS
             : null;
    if (!fn) throw new Error(`AltirraBackend.loadMedia: unsupported format '${format}'`);
    try {
      fn.call(this.core, bytes);
    } catch (e) {
      // Embind throws Wasm exceptions as `{ excPtr }` — decode if we
      // have the message helper bound.
      const ePtr = (e as { excPtr?: number })?.excPtr;
      if (ePtr != null && modulePromiseRef?.getExceptionMessage) {
        const msg = modulePromiseRef.getExceptionMessage(ePtr);
        throw new Error(`AltirraCore.load${format.toUpperCase()}: ${msg}`);
      }
      throw e;
    }
    this.refreshPixels();
  }

  advanceFrame(trap?: () => boolean): number {
    const cycles = this.core.advanceFrame(trap ?? null);
    this.refreshPixels();
    return cycles;
  }

  step(): number {
    const cycles = this.core.step();
    this.refreshPixels();
    return cycles;
  }

  cpuState(): CpuRegs {
    const c = this.core;
    const p = c.getP();
    return {
      a: c.getA(), x: c.getX(), y: c.getY(),
      pc: c.getPC(), sp: c.getS(),
      // 6502 status register bit layout: N V _ B D I Z C (bit 5 unused).
      flags: {
        n: !!(p & 0x80),
        v: !!(p & 0x40),
        b: !!(p & 0x10),
        d: !!(p & 0x08),
        i: !!(p & 0x04),
        z: !!(p & 0x02),
        c: !!(p & 0x01),
      },
    };
  }

  getPC(): number {
    return this.core.getPC() & 0xffff;
  }

  isAtInstrBoundary(): boolean {
    return this.core.isAtInstrBoundary();
  }

  readMem(addr: number, len: number): Uint8Array {
    // typed_memory_view aliases wasm memory. The Embind binding may
    // return a Uint8Array view backed by the heap whose underlying
    // ArrayBuffer can detach on later memory growth. `.slice()`
    // guarantees a detached, owned copy.
    const view = this.core.readMem(addr, len);
    return view.slice();
  }

  saveState(): unknown {
    return this.core.saveState();
  }

  loadState(snapshot: unknown): void {
    this.core.loadState(snapshot);
  }

  // Copy out of the wasm-memory view (the next core call invalidates it); the
  // pump transfers the buffer to the worklet thread (zero-copy boundary).
  private readonly audioPump = new AudioPushPump("altirra-audio", {
    pull: () => {
      const fresh = this.core.getAudioSamples();
      return fresh.length > 0 ? new Float32Array(fresh) : null;
    },
  });

  async startAudio(): Promise<void> {
    await this.audioPump.start();
  }

  async suspendAudio(): Promise<void> {
    await this.audioPump.suspend();
  }

  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers = 0) {
    this.core.sendKey(keyCode, charCode, isDown, modifiers);
  }

  setHardwareMode(mode: number) { this.core.setHardwareMode(mode); }
  setMemoryMode(mode: number)   { this.core.setMemoryMode(mode); }
  setBasic(enabled: boolean)    { this.core.setBasic(enabled); }
  setKernel(firmwareId: number) { this.core.setKernel(firmwareId); }

  setBreakpoints(addrs: Iterable<number | BankBreakpoint>) {
    // The C++ core traps purely on PC == addr (bank-blind). Register the CPU
    // address of every breakpoint — bare numbers and the `addr` of bank-aware
    // ones alike. The bank match (resume when the wrong bank is live) is done
    // consumer-side via bankMap() (ADR-0014); the core just stops at the addr.
    const cpu: number[] = [];
    for (const a of addrs) cpu.push((typeof a === "number" ? a : a.addr) & 0xffff);
    this.core.setBreakpoints(cpu);
  }

  bankMap(): BankProjection[] {
    return this.banks.map((w) =>
      decodeBankWindow(w, w.selector ? (this.core.readMem(w.selector.reg, 1)[0] ?? 0) : 0),
    );
  }

  private refreshPixels() {
    const view = this.core.pixels();
    // `view` aliases wasm memory; copy into our stable host buffer.
    this.pixels.set(view);
  }
}
