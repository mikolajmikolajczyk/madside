import { useReducer, useEffect } from "react";
import type { BuildDiagnostic } from "@ports";
import {
  getLspDiagnostics,
  subscribeLspDiagnostics,
} from "../codemirror/lsp/diagnosticsStore";

/** The LSP's semantic diagnostics for `path` (#77), re-reading whenever the
 *  server pushes a fresh set. Worker-free — reads the lightweight store the LSP
 *  client populates, so subscribing here doesn't pull the worker into the
 *  bundle. The app merges the result with its build diagnostics. */
export function useLspDiagnostics(path: string | null): BuildDiagnostic[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeLspDiagnostics(bump), []);
  return path ? getLspDiagnostics(path) : [];
}
