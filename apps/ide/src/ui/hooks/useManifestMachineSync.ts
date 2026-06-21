import { useEffect } from "react";
import type { Workbench } from "@app";

/** Sync the workbench's active machine to the project manifest's declared
 *  machine (#65 — extracted from App). On load / project switch, the manifest's
 *  `machine` changing drives `setActiveMachine`, which reconfigures the
 *  RunService backend + DebugService adapter and re-renders every
 *  `useActiveMachine()` consumer. No-op when unchanged or null. */
export function useManifestMachineSync(workbench: Workbench, manifestMachine: string | null): void {
  useEffect(() => {
    if (manifestMachine) workbench.setActiveMachine(manifestMachine);
  }, [manifestMachine, workbench]);
}
