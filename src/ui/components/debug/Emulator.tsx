import { useEffect, useRef, useState } from "react";
import type { RunBackend } from "@ports";
import { useWorkbench } from "@app";
import "./Emulator.css";

// Local Cpu shape — mirrors the @adapters/emu.CpuRegs that the parent expects.
// Re-defined here so @ui doesn't import @adapters; DebugService (M6) lifts this
// into a proper port type.
export interface CpuRegs {
  a: number; x: number; y: number; pc: number; sp: number;
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean };
}

interface Props {
  xex: Uint8Array | null;
  running: boolean;
  stepTick: number;          // bump to advance one CPU instruction
  frameTick: number;         // bump to advance one full frame (display updates)
  breakpoints?: Set<number>; // PC addresses to break on
  memBase?: number;          // base address for memory snapshot
  memLen?: number;           // bytes to snapshot
  onState?: (s: CpuRegs) => void;
  onMem?: (bytes: Uint8Array) => void;
  // BP hits emit 'debug:bp-hit' on the workbench EventBus — consumers
  // subscribe via useWorkbench().events.on('debug:bp-hit', ...) instead of
  // prop drilling onBreak.
}

export function Emulator({ xex, running, stepTick, frameTick, breakpoints, memBase = 0x2000, memLen = 128, onState, onMem }: Props) {
  const workbench = useWorkbench();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emuRef = useRef<RunBackend | null>(null);
  const imageRef = useRef<{ image: ImageData; view32: Uint32Array } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  // Boot emu through RunService — wasm core lazy-loaded under the hood.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const emu = await workbench.run.boot();
        if (cancelled) return;
        // v0.4.0 sample-rate sanity check — MachinePlugin is the canonical
        // truth; the emulator backend must agree. Drift means the wasm
        // core's hardcoded kSampleRate and the MachinePlugin.audio.sampleRate
        // diverged — fork rebuild needed (tracked in 40e0373).
        if (emu.sampleRate !== undefined && emu.sampleRate !== workbench.machine.audio.sampleRate) {
          workbench.logger.warn(
            `sample rate drift: emu=${emu.sampleRate} machine=${workbench.machine.audio.sampleRate}`,
          );
        }
        emuRef.current = emu;
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [workbench]);

  // Canvas dims sourced from workbench.machine (v0.4.0 MachinePlugin) instead
  // of the emu's own width/height — same values for Atari today, but every
  // machine the workbench gains in v1.0.0 NES validation drives its own.
  const machineWidth = workbench.machine.display.width;
  const machineHeight = workbench.machine.display.height;

  // Set up canvas + image buffer when ready
  useEffect(() => {
    const emu = emuRef.current;
    const canvas = canvasRef.current;
    if (!emu || !canvas || status !== "ready") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = machineWidth;
    canvas.height = machineHeight;
    const image = ctx.createImageData(machineWidth, machineHeight);
    const view32 = new Uint32Array(image.data.buffer);
    imageRef.current = { image, view32 };
  }, [status, machineWidth, machineHeight]);

  const emit = (emu: RunBackend) => {
    onState?.(emu.cpuState() as CpuRegs);
    onMem?.(emu.readMem(memBase & 0xffff, memLen));
  };

  const blit = () => {
    const emu = emuRef.current;
    const canvas = canvasRef.current;
    const buf = imageRef.current;
    if (!emu || !canvas || !buf) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Wasm core delivers XRGB8888 (alpha unused). Bytes in memory are
    // [B, G, R, X] (little-endian uint32 = 0xXXRRGGBB). ImageData wants
    // RGBA byte order — uint32 LE = 0xAABBGGRR. Repack + force alpha.
    const src = emu.pixels;
    const dst = buf.view32;
    const len = Math.min(src.length, dst.length);
    for (let i = 0; i < len; i++) {
      const p = src[i];
      const r = (p >>> 16) & 0xff;
      const g = (p >>> 8) & 0xff;
      const b = p & 0xff;
      dst[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
    }
    ctx.putImageData(buf.image, 0, 0);
  };

  // Load xex when it changes, or blank the screen when it goes null (Stop).
  // `status` is in the deps so the effect re-runs once the (async) emu boot
  // completes — otherwise an early Run click that fires before status="ready"
  // would leave loadXEX uncalled forever.
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || status !== "ready") return;
    if (xex) {
      void workbench.run.load(xex);
      blit();
      emit(emu);
    } else {
      // No xex = emulator stopped; black out the canvas so the last frame
      // doesn't linger.
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [xex, onState, status]);

  // Step on stepTick bump (only when paused). M1 caveat: display does
  // not refresh per step (frameRefresh's snapshot/apply trick leaves
  // sim in an inconsistent run state that breaks the next step). Real
  // display refresh is M2 work.
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || running || status !== "ready" || stepTick === 0) return;
    emu.step();
    blit();
    emit(emu);
  }, [stepTick, running, status, onState]);

  // Advance one frame on frameTick bump (only when paused). Differs
  // from step: lets CPU run through the whole frame so display + RAM
  // both update. Step granularity is per-instruction with no display
  // refresh; Frame is per-frame with both.
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || running || status !== "ready" || frameTick === 0) return;
    emu.advanceFrame();
    blit();
    emit(emu);
  }, [frameTick, running, status, onState]);

  // Refresh memory snapshot when base/len change while paused
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || running || status !== "ready") return;
    onMem?.(emu.readMem(memBase & 0xffff, memLen));
  }, [memBase, memLen, running, status, onMem]);

  // Keyboard → emu. Listen only while the canvas has focus so the editor
  // remains usable when not interacting with the emu.
  useEffect(() => {
    const canvas = canvasRef.current;
    const emu = emuRef.current;
    if (!canvas || !emu || status !== "ready") return;

    const fwd = (e: KeyboardEvent, down: boolean) => {
      // Don't capture browser navigation shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Prevent default for keys the browser would scroll on / use for nav.
      e.preventDefault();
      const charCode = e.key.length === 1 ? e.key.charCodeAt(0) : 0;
      let mods = 0;
      if (e.shiftKey) mods |= 2;   // KeyFlags.Shift
      // event.keyCode is deprecated but the C++ sendKey expects a numeric
      // Win32-style code. v0.4.0 MachinePlugin.input lifts this behind a
      // proper code → KBCODE map driven by event.code.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      emu.sendKey(e.keyCode, charCode, down, mods);
    };
    const onDown = (e: KeyboardEvent) => fwd(e, true);
    const onUp = (e: KeyboardEvent) => fwd(e, false);

    canvas.addEventListener("keydown", onDown);
    canvas.addEventListener("keyup", onUp);
    return () => {
      canvas.removeEventListener("keydown", onDown);
      canvas.removeEventListener("keyup", onUp);
    };
  }, [status]);

  // Frame loop while running
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || status !== "ready" || !running) return;

    // Resume/start audio on user gesture (Run). Suspend on pause to free CPU.
    void workbench.run.startAudio();

    // Push the BP address set into the backend. AltirraBackend traps in
    // C++ on the instruction boundary — zero JS roundtrip cost per cycle.
    emu.setBreakpoints(breakpoints ?? []);
    // Cheap predicate the tick still uses to detect "we just hit a BP".
    const trap = breakpoints && breakpoints.size > 0
      ? () => emu.isAtInstrBoundary() && breakpoints.has(emu.getPC())
      : undefined;

    // Throttle the cpu/mem snapshot so we don't pay the readMem cost
    // every frame at 60 Hz — every ~10 frames (≈6/s) keeps the panel
    // lively without dominating the loop.
    let snapshotTick = 0;
    const tick = () => {
      emu.advanceFrame(trap);
      blit();
      if (trap && trap()) {
        emit(emu);
        workbench.events.emit('debug:bp-hit', { pc: emu.getPC() });
        return;
      }
      if (++snapshotTick >= 10) {
        snapshotTick = 0;
        emit(emu);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      void workbench.run.suspendAudio();
      // Refresh CPU state on pause so Debug panel reflects where we stopped.
      emit(emu);
    };
  }, [running, status, breakpoints, onState, workbench]);

  return (
    <div className="emulator">
      <div className="emulator__header label">
        emulator {status === "loading" && "(boot…)"} {status === "error" && "(err)"}
      </div>
      <div className="emulator__canvas">
        {status === "error" ? (
          <div className="emulator__placeholder">kernel load failed: {error}</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="emulator__screen"
            tabIndex={0}
            onMouseDown={() => canvasRef.current?.focus()}
          />
        )}
      </div>
    </div>
  );
}
