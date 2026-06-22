import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DEBOUNCE_MS } from "@madside/workbench-core";
import { errorMessage } from "@ports";
import type {
  BuildDiagnostic,
  BuildInput,
  BuildResult,
  BuildService,
  DebugInfo,
  ProjectManifestV2,
  SourceMap,
  StorageBackend,
  StoredBuild,
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
  /** Persists each build so a reload restores OUTPUT + markers + binary (#62). */
  storage: StorageBackend;
}

/** AutoAssembleOutcome → the persisted shape (#62). `xex` is renamed `binary`;
 *  Maps / Uint8Array survive IDB structured clone, so everything else is as-is. */
const toStored = (o: AutoAssembleOutcome): StoredBuild => ({
  ok: o.ok,
  binary: o.xex,
  sourceMap: o.sourceMap,
  labels: o.labels,
  debugInfo: o.debugInfo,
  diagnostics: o.diagnostics,
  stdout: o.stdout,
  stderr: o.stderr,
  exitCode: o.exitCode,
});

/** StoredBuild → AutoAssembleOutcome, for hydrating `result` on project load. */
export const outcomeFromStored = (b: StoredBuild): AutoAssembleOutcome => ({
  ok: b.ok,
  xex: b.binary,
  sourceMap: b.sourceMap,
  labels: b.labels,
  debugInfo: b.debugInfo,
  diagnostics: b.diagnostics,
  stdout: b.stdout,
  stderr: b.stderr,
  exitCode: b.exitCode,
});

/** Combined build outcome the editor surfaces. Sources of truth (sourceMap,
 *  labels) come parsed from BuildService so UI never touches toolchain-
 *  specific `.lst` / `.lab` text. */
export interface AutoAssembleOutcome {
  ok: boolean;
  xex?: Uint8Array;
  sourceMap?: SourceMap;
  labels?: Map<string, number>;
  /** Typed-symbol model for the Variables panel (#130). */
  debugInfo?: DebugInfo;
  /** Inline error/warning markers for the editor (#29). */
  diagnostics?: BuildDiagnostic[];
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
  debugInfo: r.debugInfo,
  diagnostics: r.diagnostics,
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
  storage,
}: Args): UseAutoAssembleResult {
  const [result, setResult] = useState<AutoAssembleOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);

  const runAssemble = useCallback(async (): Promise<AutoAssembleOutcome | null> => {
    if (!files || !manifest || !projectId) return null;
    const seq = ++seqRef.current;
    setBusy(true);
    // Commit a fresh outcome: drive React state + persist it under this project
    // so a reload restores it (#62). Persist where the result is born — keyed by
    // the build's own projectId, never a stale one.
    const commit = (o: AutoAssembleOutcome): AutoAssembleOutcome => {
      setResult(o);
      void storage.builds.save(projectId, toStored(o));
      return o;
    };
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
        return commit(toOutcome(built.value));
      }
      return commit({
        ok: false,
        diagnostics: built.error.diagnostics,
        stdout: built.error.stdout ?? "",
        stderr: built.error.stderr || built.error.message,
        exitCode: 1,
      });
    } catch (e) {
      if (seq !== seqRef.current) return null;
      return commit({
        ok: false,
        stdout: "",
        stderr: `[runtime] ${errorMessage(e)}`,
        exitCode: 1,
      });
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, [buildService, files, manifest, projectId, storage]);

  // Build trigger (#59, project.json `build.trigger`). Default 'manual' — build
  // only on Ctrl+S / Run (runAssemble), so large projects don't recompile on
  // every keystroke. 'auto' restores the debounced rebuild-on-edit.
  const auto = manifest?.build?.trigger === "auto";
  useEffect(() => {
    if (!auto) return;
    // Same debounce window as BuildService.buildDebounced — shared constant so
    // the two can't drift (#23). The hook debounces build() (not buildDebounced)
    // because it needs the returned result to drive React state.
    const id = setTimeout(() => {
      void runAssemble();
    }, DEFAULT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [auto, runAssemble]);

  return { result, setResult, busy, runAssemble };
}
