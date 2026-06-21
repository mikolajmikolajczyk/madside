import { useSyncExternalStore } from "react";
import type { RunStatus } from "@ports";
import { useWorkbench } from "@app";

/** ADR-0007 wire. React-native subscription to RunService's FSM — components
 *  read `useRunStatus()` instead of holding a parallel `useState<boolean>`
 *  shadow of `workbench.run.status`. Returns the current status; the
 *  underlying store fires on every legal transition that emits `run:state`.
 *
 *  Referential stability: returned string is identity-stable across renders
 *  when the status didn't change (it's the same JS string value). Same-state
 *  transitions don't notify, so consumers don't re-render unnecessarily.
 *
 *  Reference impl for the M7.5 hardening epic (152abfd). DebugService gets
 *  its own `useDebugStatus()` when its FSM lands. */
export function useRunStatus(): RunStatus {
  const wb = useWorkbench();
  return useSyncExternalStore(
    (cb) => wb.run.subscribe(cb),
    () => wb.run.status,
    () => "idle",
  );
}
