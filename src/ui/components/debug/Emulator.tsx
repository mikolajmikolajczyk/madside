import { useEffect, useRef, useState } from "react";
import type { RunBackend } from "@ports";
import { useWorkbench } from "@app";
import { useRunStatus } from "../../hooks/useRunStatus";
import { useActiveMachine } from "../../hooks/useActiveMachine";
import "./Emulator.css";

// Generic CPU snapshot — register / flag ids come from the active
// DebugAdapter's descriptor table (workbench.debug.target()), so this shape
// is machine-agnostic by construction.
export interface CpuRegs {
  regs: Record<string, number>;
  flags: Record<string, boolean>;
}

interface Props {
  breakpoints?: Set<number>; // PC addresses to break on
  onState?: (s: CpuRegs) => void;
  // Step + Frame go through DebugService.step / stepFrame (1e38ae3 — the
  // canonical event path). DebugService emits debug:step-done; Emulator
  // listens + blits the canvas. The frame loop is driven by RunService's
  // FSM (ADR-0007) read through useRunStatus(). BP hits emit
  // 'debug:bp-hit' on the workbench EventBus — consumers subscribe via
  // useWorkbench().events.on('debug:bp-hit', ...) instead of prop
  // drilling onBreak. Memory snapshots flow through MemoryPanel's own
  // ctx.debug.readMemory polling, not through here.
}

export function Emulator({ breakpoints, onState }: Props) {
  const workbench = useWorkbench();
  const machine = useActiveMachine();
  const runStatus = useRunStatus();
  const running = runStatus === 'running';
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
        if (emu.sampleRate !== undefined && emu.sampleRate !== machine.audio.sampleRate) {
          workbench.logger.warn(
            `sample rate drift: emu=${emu.sampleRate} machine=${machine.audio.sampleRate}`,
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
    // Re-boot when the active machine changes — run.reconfigure() dropped the
    // old backend, so this re-runs to boot the new core (Altirra ↔ jsnes).
  }, [workbench, machine]);

  // Canvas dims sourced from the active MachinePlugin (v0.4.0) instead of the
  // emu's own width/height — Atari 336×224, NES 256×240, each machine drives
  // its own.
  const machineWidth = machine.display.width;
  const machineHeight = machine.display.height;

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
    // Project raw cpuState() into the descriptor-keyed shape Debug consumes.
    // Atari's Altirra backend reports a flat 6502 shape; non-6502 machines
    // will route this through their own DebugAdapter in the EmulatorPlugin
    // follow-up so this conversion moves into the adapter itself.
    const raw = emu.cpuState() as {
      a: number; x: number; y: number; pc: number; sp: number;
      flags: Record<string, boolean>;
    };
    onState?.({
      regs: { a: raw.a, x: raw.x, y: raw.y, pc: raw.pc, sp: raw.sp },
      flags: { ...raw.flags },
    });
  };

  const pixelFormat = machine.display.pixelFormat;

  const blit = () => {
    const emu = emuRef.current;
    const canvas = canvasRef.current;
    const buf = imageRef.current;
    if (!emu || !canvas || !buf) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const src = emu.pixels;
    const dst = buf.view32;
    const len = Math.min(src.length, dst.length);
    if (pixelFormat === 'rgba8888') {
      // Backend already delivers ImageData-compatible RGBA — memcpy fast path.
      dst.set(src.subarray(0, len));
    } else {
      // 'xrgb8888' (Atari Altirra core today). Bytes in memory are
      // [B, G, R, X] (little-endian uint32 = 0xXXRRGGBB). ImageData wants
      // RGBA byte order — uint32 LE = 0xAABBGGRR. Repack + force alpha.
      // 4.5 M iter/s @ 60fps; backend-side RGBA emit eliminates this loop —
      // tracked in the same issue body.
      for (let i = 0; i < len; i++) {
        const p = src[i];
        const r = (p >>> 16) & 0xff;
        const g = (p >>> 8) & 0xff;
        const b = p & 0xff;
        dst[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
      }
    }
    ctx.putImageData(buf.image, 0, 0);
  };

  // ADR-0007 / 625ed88: media load lives in App.onRun (workbench.run.load) —
  // the Emulator no longer owns it. On RunService 'loaded' transition we
  // blit the first frame + emit the post-load CPU state; on 'idle' (Stop
  // before a load) we blank the canvas.
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || status !== "ready") return;
    if (runStatus === 'loaded' || runStatus === 'paused' || runStatus === 'running') {
      blit();
      emit(emu);
      return;
    }
    if (runStatus === 'idle' || runStatus === 'crashed') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [runStatus, onState, status]);

  // 1e38ae3: DebugService.step / stepFrame is the canonical step path.
  // DebugService drives the underlying DebugTarget + emits debug:step-done;
  // Emulator subscribes here to keep the canvas + App-side CPU snapshot in
  // sync. Per-instruction display refresh stays in backlog (c309619) —
  // step() doesn't repaint between instructions; stepFrame() always advances
  // a real ANTIC frame because DebugService internally bypasses BPs while
  // advanceFrame runs (mirrors the 03d7cd5 fix that used to live here).
  useEffect(() => {
    return workbench.events.on('debug:step-done', () => {
      const emu = emuRef.current;
      if (!emu || status !== "ready") return;
      blit();
      emit(emu);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbench, status, onState]);

  // Keyboard → emu. Listen only while the canvas has focus so the editor
  // remains usable when not interacting with the emu.
  useEffect(() => {
    const canvas = canvasRef.current;
    const emu = emuRef.current;
    if (!canvas || !emu || status !== "ready") return;

    // MachinePlugin.input.codeToKey is the canonical event.code → numeric
    // keycode table. Win32-style virtual-key codes match what the Altirra
    // wasm core's PushKey expects; the C++ table acts as a fallback.
    const codeToKey = machine.input.codeToKey ?? {};

    // Track held keys → modifier state so we can force-release on focus
    // loss / blur (stuck Shift bug after Cmd-Tab) and report the correct
    // composite modifier byte even when a modifier release event is lost.
    const held = new Map<string, { key: number; mods: number }>();

    const computeMods = (e: KeyboardEvent | null = null): number => {
      let mods = 0;
      if (e?.shiftKey) mods |= 2;   // KeyFlags.Shift
      // Track Shift state via the held map too so synthesized release on
      // blur gets the same modifier byte the original keydown sent.
      if (held.has('ShiftLeft') || held.has('ShiftRight')) mods |= 2;
      return mods;
    };

    const fwd = (e: KeyboardEvent, down: boolean) => {
      // Don't capture browser navigation shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Prevent default for keys the browser would scroll on / use for nav.
      e.preventDefault();
      const charCode = e.key.length === 1 ? e.key.charCodeAt(0) : 0;
      // Pull mapped key from MachinePlugin first; fall back to (deprecated
      // but still-supported) event.keyCode for any code not in the table.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const key = codeToKey[e.code] ?? e.keyCode;
      const mods = computeMods(e);
      if (down) {
        held.set(e.code, { key, mods });
      } else {
        held.delete(e.code);
      }
      emu.sendKey(key, charCode, down, mods);
    };

    /** Synthesize keyup for every key we still think is held. Called on blur
     *  and on the effect's cleanup so a stale Shift after Cmd-Tab doesn't
     *  leave the next emu run in shifted mode. */
    const releaseAll = () => {
      for (const [, entry] of held) {
        emu.sendKey(entry.key, 0, false, entry.mods);
      }
      held.clear();
    };

    const onDown = (e: KeyboardEvent) => fwd(e, true);
    const onUp = (e: KeyboardEvent) => fwd(e, false);
    const onBlur = () => releaseAll();

    canvas.addEventListener("keydown", onDown);
    canvas.addEventListener("keyup", onUp);
    canvas.addEventListener("blur", onBlur);
    return () => {
      releaseAll();
      canvas.removeEventListener("keydown", onDown);
      canvas.removeEventListener("keyup", onUp);
      canvas.removeEventListener("blur", onBlur);
    };
  }, [status, workbench, machine]);

  // Audio lifecycle — deliberately separate from the frame loop below. Keyed on
  // run state only, NOT on `breakpoints`: a rebuild while running produces a new
  // sourceMap → a new `breakpoints` Set identity, which used to tear down + restart
  // this effect. The async startAudio/suspendAudio then raced and the AudioContext
  // got stuck suspended (audio died on any edit during a run). Splitting it out
  // means editing only restarts the cheap rAF loop, never the audio.
  useEffect(() => {
    if (status !== "ready" || !running) return;
    void workbench.run.startAudio();
    return () => { void workbench.run.suspendAudio(); };
  }, [running, status, workbench]);

  // Frame loop while running
  useEffect(() => {
    const emu = emuRef.current;
    if (!emu || status !== "ready" || !running) return;

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
      // One final CPU snapshot so App-side pcLine + status bar reflect
      // where the sim stopped. Panel refresh on pause is handled by
      // run:state{paused} — RunService emits it the moment pause() is
      // called (panels subscribe via ADR-0007 wire).
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
