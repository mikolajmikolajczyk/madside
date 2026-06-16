import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DEBOUNCE_MS } from "@services";
import type {
  BuildInput,
  BuildResult,
  BuildService,
  ProjectManifestV2,
  SourceMap,
} from "@ports";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

interface Args {
  buildService: BuildService;
  files: ProjectFile[] | null;
  manifest: ProjectManifestV2 | null;
  projectId: string | null;
}

/** Combined build outcome the editor surfaces. Sources of truth (sourceMap,
 *  labels) come parsed from BuildService so UI never touches toolchain-
 *  specific `.lst` / `.lab` text. */
export interface AutoAssembleOutcome {
  ok: boolean;
  xex?: Uint8Array;
  sourceMap?: SourceMap;
  labels?: Map<string, number>;
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
  sourceMap: r.sourceMap,
  labels: r.labels,
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
  manifest,
  projectId,
}: Args): UseAutoAssembleResult {
  const [result, setResult] = useState<AutoAssembleOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);

  const runAssemble = useCallback(async (): Promise<AutoAssembleOutcome | null> => {
    if (!files || !manifest || !projectId) return null;
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
        manifest,
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
  }, [buildService, files, manifest, projectId]);

  useEffect(() => {
    // Same debounce window as BuildService.buildDebounced — shared constant so
    // the two can't drift (#23). The hook debounces build() (not buildDebounced)
    // because it needs the returned result to drive React state.
    const id = setTimeout(() => {
      void runAssemble();
    }, DEFAULT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [runAssemble]);

  return { result, setResult, busy, runAssemble };
}
