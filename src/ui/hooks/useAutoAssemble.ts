import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildInput, BuildResult, BuildService, Recipe } from "@ports";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

interface Args {
  buildService: BuildService;
  files: ProjectFile[] | null;
  main: string | null;
  recipes: Recipe[] | null | undefined;
  projectId: string | null;
}

/** Combined build outcome the editor surfaces — mirrors the legacy
 *  AssembleResult shape so existing source-map / breakpoint code keeps
 *  working without an additional adapter layer in the UI. */
export interface AutoAssembleOutcome {
  ok: boolean;
  xex?: Uint8Array;
  lst?: string;
  lab?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface UseAutoAssembleResult {
  result: AutoAssembleOutcome | null;
  setResult: (r: AutoAssembleOutcome | null) => void;
  busy: boolean;
  /** Force-trigger an assemble now (skip the 400ms debounce). Returns
   *  the result whose seq is freshest at completion; stale builds are
   *  dropped silently and yield the latest committed result. */
  runAssemble: () => Promise<AutoAssembleOutcome | null>;
}

const toOutcome = (r: BuildResult): AutoAssembleOutcome => ({
  ok: true,
  xex: r.binary,
  lst: r.listing,
  lab: (r.extras as { labels?: string } | undefined)?.labels,
  stdout: r.stdout,
  stderr: r.stderr,
  exitCode: 0,
});

/** Auto-assemble pipeline. Now a thin React-side wrapper around BuildService:
 *
 *   1. On every change to `files / main / recipes / projectId`, debounce
 *      400 ms and call `runAssemble`.
 *   2. `runAssemble` delegates to `buildService.build({...})` which runs
 *      recipes + toolchain in one race-guarded pass.
 *   3. A monotonically-increasing seq counter on the hook side picks the
 *      latest committed result — independent of the service's own
 *      race-guard, so React state isn't clobbered by a late return. */
export function useAutoAssemble({
  buildService,
  files,
  main,
  recipes,
  projectId,
}: Args): UseAutoAssembleResult {
  const [result, setResult] = useState<AutoAssembleOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);

  const runAssemble = useCallback(async (): Promise<AutoAssembleOutcome | null> => {
    if (!files || !main || !projectId) return null;
    const seq = ++seqRef.current;
    setBusy(true);
    try {
      const input: BuildInput = {
        projectId,
        files: files.map((f) => ({
          path: f.path,
          content: f.content,
          updatedAt: 0,
        })),
        manifest: { main, recipes: recipes ?? [] },
      };
      const built = await buildService.build(input);
      if (seq !== seqRef.current) return null;
      if (built.ok) {
        const outcome = toOutcome(built.value);
        setResult(outcome);
        return outcome;
      }
      const outcome: AutoAssembleOutcome = {
        ok: false,
        stdout: "",
        stderr: built.error.stderr ?? built.error.message,
        exitCode: 1,
      };
      setResult(outcome);
      return outcome;
    } catch (e) {
      if (seq !== seqRef.current) return null;
      const outcome: AutoAssembleOutcome = {
        ok: false,
        stdout: "",
        stderr: `[runtime] ${String(e)}`,
        exitCode: 1,
      };
      setResult(outcome);
      return outcome;
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, [buildService, files, main, recipes, projectId]);

  useEffect(() => {
    const id = setTimeout(() => {
      void runAssemble();
    }, 400);
    return () => clearTimeout(id);
  }, [runAssemble]);

  return { result, setResult, busy, runAssemble };
}
