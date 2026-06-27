// Shared audio plumbing for emulator backends. Both the Altirra (POKEY) and
// jsnes (APU) backends push PCM chunks to an AudioWorklet at the audio thread's
// pace; this was copy-pasted twice (the worklet file AND the main-thread pump).
// One source of truth here, parameterized by the only thing that differed: the
// processor name and where the next chunk comes from (issue #10).

/** The AudioWorklet processor as a source string. Built into a Blob URL at
 *  runtime (no static .js asset), registered under `processorName`. It keeps an
 *  internal queue of posted Float32Array chunks and copies them into each output
 *  block, padding silence on underrun so the graph never starves. `'flush'`
 *  clears the queue. */
export function pcmQueueWorkletSource(processorName: string): string {
  return `
class PcmQueueProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    // Linear-resample the source samples to the context rate. We can't pin the
    // context's sample rate to the source's: iOS Safari silently produces no
    // audio from a context forced to a non-native rate (44100 vs the device's
    // 48000). So run the context at its native rate and resample here instead.
    const src = (options && options.processorOptions && options.processorOptions.sourceRate) || sampleRate
    this.step = src / sampleRate
    // Channel count of the source stream. >1 means the posted buffers are
    // interleaved frames (L,R,L,R…); pos counts frames, not samples.
    this.channels = (options && options.processorOptions && options.processorOptions.channels) || 1
    this.buf = new Float32Array(0)  // unconsumed samples (interleaved if channels>1)
    this.pos = 0                    // fractional read index, in frames
    this.port.onmessage = (ev) => {
      if (ev.data instanceof Float32Array) {
        const merged = new Float32Array(this.buf.length + ev.data.length)
        merged.set(this.buf, 0)
        merged.set(ev.data, this.buf.length)
        this.buf = merged
      } else if (ev.data === 'flush') {
        this.buf = new Float32Array(0)
        this.pos = 0
      }
    }
  }

  process(_inputs, outputs) {
    const chans = outputs[0]
    const out0 = chans[0]
    if (!out0) return true
    const buf = this.buf
    const step = this.step
    const nch = this.channels
    const frames = out0.length
    const avail = (buf.length / nch) | 0  // whole frames buffered
    let pos = this.pos
    let i = 0
    for (; i < frames; i++) {
      const ip = Math.floor(pos)
      if (ip + 1 >= avail) break  // not enough buffered to interpolate the next frame
      const frac = pos - ip
      const a = ip * nch
      const b = (ip + 1) * nch
      for (let c = 0; c < nch; c++) {
        const oc = chans[c]
        if (oc) oc[i] = buf[a + c] + (buf[b + c] - buf[a + c]) * frac
      }
      pos += step
    }
    for (; i < frames; i++) for (let c = 0; c < nch; c++) { const oc = chans[c]; if (oc) oc[i] = 0 }
    // Drop the whole frames we've consumed; keep the fractional remainder.
    const consumed = Math.floor(pos)
    this.buf = consumed > 0 ? buf.subarray(consumed * nch) : buf
    this.pos = pos - consumed
    return true
  }
}

registerProcessor(${JSON.stringify(processorName)}, PcmQueueProcessor)
`;
}

export interface AudioPushPumpOptions {
  /** Pull the next chunk to enqueue, or null when nothing is ready. Called every
   *  tick; ownership of the returned buffer transfers to the worklet (zero-copy).
   *  The caller must return a *copy* it no longer reads (wasm-memory views are
   *  invalidated by the next core call). */
  pull: () => Float32Array | null;
  /** Pin the AudioContext sample rate (jsnes feeds its native APU rate). Omit to
   *  use the device default (Altirra resamples internally). */
  sampleRate?: number;
  /** Source channel count. 1 (default) = mono; 2 = interleaved stereo frames
   *  (L,R,L,R…) — the pumped buffers must be interleaved and the worklet outputs
   *  that many channels. */
  channels?: number;
  /** Pump interval in ms — tight enough to keep the queue stable, below
   *  scheduler jitter. Default 5. */
  intervalMs?: number;
}

// One shared AudioContext for every pump. iOS Safari only lets an AudioContext
// run if it was created + resumed inside a user gesture; our startAudio() fires
// after an async build/load chain (not in the gesture), so a per-pump context
// created there stays suspended forever → silence on iOS (all machines). Sharing
// one context lets a single first-gesture unlock (primeAudio) cover everything,
// and suspend() leaves it running so it never re-locks.
let sharedCtx: AudioContext | null = null;

function getSharedCtx(): AudioContext {
  // Always the device's NATIVE rate — never a forced one. iOS Safari produces no
  // audio at all from a context pinned to a non-native sample rate; the worklet
  // resamples the source to this rate instead.
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

/** Unlock audio on a user gesture (iOS). Creates + resumes the shared
 *  AudioContext and plays a one-sample silent buffer to nudge iOS into starting
 *  it, so a later (async) startAudio() finds it already running. Idempotent;
 *  no-op outside a browser. Call from a global first-gesture handler. */
export function primeAudio(): void {
  if (typeof AudioContext === "undefined") return;
  const ctx = getSharedCtx();
  if (ctx.state === "suspended") void ctx.resume();
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* a failed warm-up blip is harmless */
  }
}

/** Drains a backend's sample source into an AudioWorklet sink on the shared
 *  AudioContext. start() attaches a worklet node + posts chunks on an interval;
 *  suspend() stops the pump + flushes but leaves the (unlocked) context running. */
export class AudioPushPump {
  private node: AudioWorkletNode | null = null;
  private timer: number | null = null;
  private readonly processorName: string;
  private readonly opts: AudioPushPumpOptions;

  constructor(processorName: string, opts: AudioPushPumpOptions) {
    this.processorName = processorName;
    this.opts = opts;
  }

  async start(): Promise<void> {
    const ctx = getSharedCtx();
    // iOS: resume in case the context is still suspended (primeAudio should have
    // unlocked it on the first gesture, but resume() here is harmless on desktop).
    if (ctx.state === "suspended") await ctx.resume();
    if (!this.node) {
      const url = URL.createObjectURL(
        new Blob([pcmQueueWorkletSource(this.processorName)], { type: "text/javascript" }),
      );
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const channels = this.opts.channels ?? 1;
      const node = new AudioWorkletNode(ctx, this.processorName, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [channels],
        // The worklet resamples from the source rate to the context's native rate.
        processorOptions: { sourceRate: this.opts.sampleRate ?? ctx.sampleRate, channels },
      });
      node.connect(ctx.destination);
      this.node = node;
    }
    this.startTimer();
  }

  private startTimer(): void {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => {
      if (!this.node) return;
      const chunk = this.opts.pull();
      if (chunk && chunk.length > 0) {
        this.node.port.postMessage(chunk, [chunk.buffer]);
      }
    }, this.opts.intervalMs ?? 5);
  }

  suspend(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    // Flush the worklet queue but DON'T suspend the shared context: on iOS a
    // suspended context can only be resumed inside a user gesture, and our next
    // start() is async (not in one) — suspending here would re-lock audio after
    // the first run. The context stays running; no chunks pushed = silence.
    if (this.node) this.node.port.postMessage("flush");
  }
}
