// Altirra wasm-core backend. Lazy-loads the Emscripten ES module from
// `./wasm/altirra-core.js` (Vite-tracked), instantiates the C++ `AltirraCore` class,
// and forwards all `EmuBackend` calls into it.
//
// Compared with the 8bw backend (now retired) this is a thin shim: the
// heavy lifting lives in the wasm core (Altirra by Avery Lee), and the
// host only owns the pixel/audio plumbing.

import type { CpuRegs, EmuBackend } from "./backend";

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
import createAltirraCore from "./wasm/altirra-core.js";
import altirraWasmUrl from "./wasm/altirra-core.wasm?url";

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

export class AltirraBackend implements EmuBackend {
  static async create(): Promise<AltirraBackend> {
    const mod = await loadModule();
    const core = new mod.AltirraCore();
    return new AltirraBackend(core);
  }

  private core: AltirraCoreInstance;
  readonly width: number;
  readonly height: number;
  readonly sampleRate: number;
  pixels: Uint32Array;

  private constructor(core: AltirraCoreInstance) {
    this.core = core;
    this.width = core.width;
    this.height = core.height;
    this.sampleRate = core.sampleRate;
    // Allocate a stable host-side buffer; per-frame copy happens in
    // advanceFrame / frameRefresh via `this.refreshPixels()`.
    this.pixels = new Uint32Array(this.width * this.height);
  }

  reset() {
    this.core.reset();
    this.refreshPixels();
  }

  loadXEX(xex: Uint8Array) { this.loadMedia('xex', xex); }
  loadATR(atr: Uint8Array) { this.loadMedia('atr', atr); }
  loadCAR(car: Uint8Array) { this.loadMedia('car', car); }
  loadCAS(cas: Uint8Array) { this.loadMedia('cas', cas); }

  private loadMedia(format: 'xex' | 'atr' | 'car' | 'cas', bytes: Uint8Array) {
    const fn = format === 'xex' ? this.core.loadXEX
             : format === 'atr' ? this.core.loadATR
             : format === 'car' ? this.core.loadCAR
             : this.core.loadCAS;
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

  frameRefresh(): void {
    // C++ side does the snapshot/advance/restore trick so GTIA's
    // frame buffer reflects current RAM without progressing sim
    // state. After it returns, refresh the host-side pixels copy.
    this.core.frameRefresh();
    this.refreshPixels();
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

  private audioCtx: AudioContext | null = null;
  private audioQueue: Float32Array[] = [];
  private audioQueueOffset = 0;

  async startAudio(): Promise<void> {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      return;
    }
    const ctx = new AudioContext();
    // ScriptProcessorNode is deprecated but still universally supported
    // and avoids the AudioWorklet module-loading dance. 1024 samples ≈
    // 23ms latency at 44.1kHz — good enough for a debugger UI.
    const node = ctx.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = (ev) => {
      const out = ev.outputBuffer.getChannelData(0);
      let written = 0;
      while (written < out.length) {
        if (this.audioQueue.length === 0) {
          // Pull more from the core. Returns view aliasing wasm memory.
          const fresh = this.core.getAudioSamples();
          if (fresh.length > 0) this.audioQueue.push(new Float32Array(fresh));
          else break;
        }
        const head = this.audioQueue[0];
        const take = Math.min(out.length - written, head.length - this.audioQueueOffset);
        out.set(head.subarray(this.audioQueueOffset, this.audioQueueOffset + take), written);
        written += take;
        this.audioQueueOffset += take;
        if (this.audioQueueOffset >= head.length) {
          this.audioQueue.shift();
          this.audioQueueOffset = 0;
        }
      }
      // Pad remainder with silence if the core underran.
      if (written < out.length) out.fill(0, written);
    };
    node.connect(ctx.destination);
    this.audioCtx = ctx;
  }

  async suspendAudio(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === "running") {
      await this.audioCtx.suspend();
    }
  }

  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers = 0) {
    this.core.sendKey(keyCode, charCode, isDown, modifiers);
  }

  setHardwareMode(mode: number) { this.core.setHardwareMode(mode); }
  setMemoryMode(mode: number)   { this.core.setMemoryMode(mode); }
  setBasic(enabled: boolean)    { this.core.setBasic(enabled); }
  setKernel(firmwareId: number) { this.core.setKernel(firmwareId); }

  setBreakpoints(addrs: Iterable<number>) {
    this.core.setBreakpoints([...addrs].map((a) => a & 0xffff));
  }

  private refreshPixels() {
    const view = this.core.pixels();
    // `view` aliases wasm memory; copy into our stable host buffer.
    this.pixels.set(view);
  }
}
