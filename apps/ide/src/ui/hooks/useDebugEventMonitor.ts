import { useEffect } from "react";
import type { Workbench } from "@app";

/** Subscribe to `debug:bp-hit` from the workbench bus (#65 — extracted from
 *  App). Emulator.tsx emits it on every BP trap inside the frame loop; pause via
 *  the FSM (ADR-0007) and surface the trap PC through `setBrokeOn`. `setBrokeOn`
 *  is App's stable `useState` updater — in the dep array for exhaustive-deps,
 *  but its identity never changes so the subscription isn't churned. */
export function useDebugEventMonitor(
  workbench: Workbench,
  setBrokeOn: (pc: number | null) => void,
): void {
  useEffect(() => {
    return workbench.events.on("debug:bp-hit", ({ pc }) => {
      if (workbench.run.status === "running") workbench.run.pause();
      setBrokeOn(pc);
    });
  }, [workbench, setBrokeOn]);
}
