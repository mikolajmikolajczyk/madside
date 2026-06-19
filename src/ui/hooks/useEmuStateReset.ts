import { useCallback, useEffect } from "react";
import type { Workbench } from "@app";
import type { CpuRegs } from "../components/debug/Emulator";
import { outcomeFromStored, type AutoAssembleOutcome } from "./useAutoAssemble";

interface Args {
  workbench: Workbench;
  projectId: string | null;
  setResult: (r: AutoAssembleOutcome | null) => void;
  setCpu: (c: CpuRegs | null) => void;
  setMemBaseTouched: (b: boolean) => void;
  setBrokeOn: (n: number | null) => void;
  setRunBlockedMsg: (m: string | null) => void;
}

export interface EmuStateResetControls {
  /** Full emulator-state wipe. Three call sites want the same blast: project
   *  change, Stop, Reset. `keepResult` / `keepMemTouched` let Stop retain the
   *  build (xex + gutter + sourceMap reflect the build, not the emu). */
  resetEmuState: (opts?: { keepResult?: boolean; keepMemTouched?: boolean }) => void;
}

/** Emulator-state lifecycle (#65 — extracted from App). Owns the reset blast +
 *  the two project-load effects. **The two effects must stay here in this order**
 *  — the synchronous reset-on-switch runs first, then the async build restore
 *  lands on top of the cleared slate (#62). Splitting or reordering them would
 *  let a stale reset wipe the freshly-restored build. The setters are App's
 *  `useState` updaters (stable identities); listing them in the dep arrays is a
 *  no-op for behaviour but keeps exhaustive-deps honest now that they arrive as
 *  params rather than in-scope `useState` returns. */
export function useEmuStateReset({
  workbench,
  projectId,
  setResult,
  setCpu,
  setMemBaseTouched,
  setBrokeOn,
  setRunBlockedMsg,
}: Args): EmuStateResetControls {
  // FSM-side: workbench.run.unload() drops media + transitions to 'idle' so the
  // next Run boots from scratch (matches the pre-FSM Stop UX — blank canvas, no
  // last-frame residue). Don't try to be clever about a subset.
  const resetEmuState = useCallback(
    (opts?: { keepResult?: boolean; keepMemTouched?: boolean }) => {
      if (workbench.run.status !== "idle") workbench.run.unload();
      if (!opts?.keepResult) setResult(null);
      setCpu(null);
      if (!opts?.keepMemTouched) setMemBaseTouched(false);
      setBrokeOn(null);
      setRunBlockedMsg(null);
    },
    [workbench, setResult, setCpu, setMemBaseTouched, setBrokeOn, setRunBlockedMsg],
  );

  useEffect(() => {
    // Genuine reset side-effect on project switch — unloads the emulator
    // (workbench.run.unload()) as well as clearing state, so it belongs in an
    // effect, not an adjust-during-render (#28). (No set-state-in-effect
    // disable needed here: resetEmuState's setters arrive as params, so the
    // rule can't trace them as setState — unlike the in-App original.)
    resetEmuState();
  }, [projectId, resetEmuState]);

  // Restore the last build from storage on project load (#62) — OUTPUT panel +
  // inline error markers + the binary (Run without a rebuild) come back instead
  // of a blank slate after a reload. Async, so it lands after the reset above;
  // cancelled if the project switches before the load resolves.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void workbench.storage.builds.load(projectId).then((b) => {
      if (!cancelled && b) setResult(outcomeFromStored(b));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, workbench, setResult]);

  return { resetEmuState };
}
