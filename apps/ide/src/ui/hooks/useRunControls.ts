import { useCallback } from "react";
import type { Workbench } from "@app";
import type { SourceMap } from "@ports";
import type { CpuRegs } from "../components/debug/Emulator";
import type { AutoAssembleOutcome } from "./useAutoAssemble";

interface Args {
  workbench: Workbench;
  runAssemble: () => Promise<AutoAssembleOutcome | null>;
  resetEmuState: (opts?: { keepResult?: boolean; keepMemTouched?: boolean }) => void;
  sourceMap: SourceMap | null;
  cpu: CpuRegs | null;
  setBrokeOn: (n: number | null) => void;
  setRunBlockedMsg: (m: string | null) => void;
}

export interface RunControls {
  onRun: () => Promise<void>;
  onPause: () => void;
  onStep: () => void;
  onStepFrame: () => void;
  onStepOver: () => void;
  onStop: () => void;
  onReset: () => Promise<void>;
}

/** Run/debug transport controls (#65 — extracted from App). Each callback drives
 *  the RunService/DebugService FSMs; `result` + `runAssemble` come from
 *  useAutoAssemble, `resetEmuState` from useEmuStateReset. The `set*` params are
 *  App's stable `useState` updaters — in the dep arrays for exhaustive-deps,
 *  identity-stable so the callbacks aren't needlessly rebuilt. */
export function useRunControls({
  workbench,
  runAssemble,
  resetEmuState,
  sourceMap,
  cpu,
  setBrokeOn,
  setRunBlockedMsg,
}: Args): RunControls {
  const onRun = useCallback(async () => {
    // Smart Play. After a BP hit / Pause the emu is at 'paused' with the
    // binary still resident — Play resumes from the same PC. Only Stop
    // (which unload()s to 'idle') or a fresh boot forces a re-load.
    const status = workbench.run.status;
    if (status === "paused" || status === "loaded") {
      setBrokeOn(null);
      setRunBlockedMsg(null);
      workbench.run.run();
      return;
    }
    // Cold run: rebuild the CURRENT source rather than trusting the last result.
    // The auto-assemble is debounced, so a breaking edit may not have rebuilt yet
    // — running the cached (stale-green) binary would silently run old code. A
    // fresh assemble means a broken source blocks here instead.
    const r = await runAssemble();
    if (!r?.ok || !r.xex) {
      // Nothing to load — tell the user where to look, in the emulator window.
      setRunBlockedMsg("Compilation error. Check output.");
      return;
    }
    const loadResult = await workbench.run.load(r.xex);
    if (!loadResult.ok) {
      setRunBlockedMsg("Failed to load binary. Check output.");
      return;
    }
    setBrokeOn(null);
    setRunBlockedMsg(null);
    workbench.run.run();
  }, [runAssemble, workbench, setBrokeOn, setRunBlockedMsg]);

  const onPause = useCallback(() => {
    if (workbench.run.status === "running") workbench.run.pause();
  }, [workbench]);

  // 1e38ae3: Step + Frame go through DebugService (canonical event path).
  // DebugService.step/stepFrame call the active DebugTarget + emit
  // debug:step-done; Emulator listens + blits the canvas (no more
  // stepTick/frameTick prop drilling).
  const onStep = useCallback(() => {
    void workbench.debug.step();
  }, [workbench]);
  const onStepFrame = useCallback(() => {
    void workbench.debug.stepFrame();
  }, [workbench]);

  // Step Over: advance to the next source line, running through no-source code
  // (cc65 library calls like clrscr) transparently instead of stepping into
  // them instruction-by-instruction (#49). Falls back to a single instruction
  // step when there's no source map (e.g. a raw binary).
  //
  // ⚠️ Stale-closure footgun: the async `stepLine` predicate captures `sourceMap`
  // + `cpu` from this render. They're in the dep array, so each new value
  // rebuilds onStepOver — but a step kicked off just before a rebuild runs its
  // predicate against the captured snapshot. That's intended (a step reasons
  // about the line it started on), but don't "optimise" the deps away.
  const onStepOver = useCallback(() => {
    if (!sourceMap) {
      void workbench.debug.step();
      return;
    }
    const startPc = cpu?.regs.pc;
    const start = startPc != null ? sourceMap.addrToLoc.get(startPc) : undefined;
    const lineMap = start ? sourceMap.locToAddr.get(start.file) : undefined;
    if (!start || !lineMap) { void workbench.debug.step(); return; }
    // Step over = run to the entry of any *other* source line (so a call on this
    // line runs to completion first). Frame-stepping in stepOver services
    // interrupts, so a printf that HALTs for the ROM's 50 Hz tick completes
    // instead of single-step getting stuck. The nearest line reached wins, so a
    // forward step lands on the next line and a backward branch on its target.
    const targets: number[] = [];
    for (const [line, addr] of lineMap) if (line !== start.line) targets.push(addr);
    void workbench.debug.stepOver(targets);
  }, [workbench, sourceMap, cpu]);

  const onStop = useCallback(() => {
    // Unload the emulator: drop xex from the running side so the next Run
    // boots fresh. result + addr gutter + sourceMap stay (those reflect
    // the build, not the emu).
    resetEmuState({ keepResult: true, keepMemTouched: true });
  }, [resetEmuState]);

  const onReset = useCallback(async () => {
    const wasRunning = workbench.run.status === "running";
    resetEmuState();
    const r = await runAssemble();
    // If emu was active, restart from the top so Reset acts like "restart".
    if (wasRunning && r?.ok && r.xex) {
      const loadResult = await workbench.run.load(r.xex);
      if (loadResult.ok) workbench.run.run();
    }
  }, [runAssemble, resetEmuState, workbench]);

  return { onRun, onPause, onStep, onStepFrame, onStepOver, onStop, onReset };
}
