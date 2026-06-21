import { useSyncExternalStore } from "react";
import type { MachinePlugin } from "@ports";
import { useWorkbench } from "@app";

/** ADR-0007 wire for the active MachinePlugin. The workbench owns the active
 *  machine (swapped by `setActiveMachine` from `project.manifest.machine`);
 *  components read it through this hook instead of touching `workbench.machine`
 *  directly, so a machine switch re-renders the display, panels, and input
 *  mapping. The store fires on every `setActiveMachine` swap. */
export function useActiveMachine(): MachinePlugin {
  const wb = useWorkbench();
  return useSyncExternalStore(
    (cb) => wb.subscribeMachine(cb),
    () => wb.machine,
  );
}
