import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Workbench } from "./createWorkbench";
import { createWorkbench } from "./createWorkbench";
import { createIdbProjectRepository } from "@adapters/storage-idb";
import { createConsoleLogger } from "@adapters/logger";

// Workbench Provider lives in @app because wiring concrete adapters into the
// headless workbench is exactly what the @app layer is for (ADR-0002).
// @ui consumes the provider + the hook through @app's barrel.

const WorkbenchContext = createContext<Workbench | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const workbench = useMemo(
    () =>
      createWorkbench({
        projectRepo: createIdbProjectRepository(),
        logger: createConsoleLogger("madside"),
      }),
    [],
  );
  return <WorkbenchContext.Provider value={workbench}>{children}</WorkbenchContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider; splitting them gains nothing
export function useWorkbench(): Workbench {
  const wb = useContext(WorkbenchContext);
  if (!wb) {
    throw new Error("useWorkbench called outside <WorkbenchProvider>");
  }
  return wb;
}
