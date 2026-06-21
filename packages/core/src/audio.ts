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
  constructor() {
    super()
    this.queue = []
    this.head = 0
    this.port.onmessage = (ev) => {
      if (ev.data instanceof Float32Array) {
        this.queue.push(ev.data)
      } else if (ev.data === 'flush') {
        this.queue.length = 0
        this.head = 0
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0]
    if (!out) return true
    let written = 0
    while (written < out.length) {
      if (this.queue.length === 0) break
      const buf = this.queue[0]
      const take = Math.min(out.length - written, buf.length - this.head)
      out.set(buf.subarray(this.head, this.head + take), written)
      written += take
      this.head += take
      if (this.head >= buf.length) {
        this.queue.shift()
        this.head = 0
      }
    }
    if (written < out.length) out.fill(0, written)
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
  /** Pump interval in ms — tight enough to keep the queue stable, below
   *  scheduler jitter. Default 5. */
  intervalMs?: number;
}

/** Drains a backend's sample source into an AudioWorklet sink. Lazily creates
 *  the AudioContext + worklet on first start() (needs a user gesture), then
 *  posts chunks on an interval. suspend() stops the pump, flushes the queue, and
 *  suspends the context. */
export class AudioPushPump {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private timer: number | null = null;
  private readonly processorName: string;
  private readonly opts: AudioPushPumpOptions;

  constructor(processorName: string, opts: AudioPushPumpOptions) {
    this.processorName = processorName;
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.startTimer();
      return;
    }
    const ctx = this.opts.sampleRate
      ? new AudioContext({ sampleRate: this.opts.sampleRate })
      : new AudioContext();
    const url = URL.createObjectURL(
      new Blob([pcmQueueWorkletSource(this.processorName)], { type: "text/javascript" }),
    );
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, this.processorName, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
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

  async suspend(): Promise<void> {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.node) this.node.port.postMessage("flush");
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }
}
