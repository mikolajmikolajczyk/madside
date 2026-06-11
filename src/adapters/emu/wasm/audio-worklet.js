// AltirraAudioWorklet — AudioWorkletProcessor that drains main-thread-posted
// Float32Array sample chunks into the output buffer. Replaces the deprecated
// ScriptProcessorNode pattern.
//
// Main thread posts chunks via port.postMessage(Float32Array); processor
// maintains an internal queue and copies into the per-block output at the
// audio thread's pace. Silence padding on underrun keeps the graph alive.

class AltirraAudioProcessor extends AudioWorkletProcessor {
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

registerProcessor('altirra-audio', AltirraAudioProcessor)
