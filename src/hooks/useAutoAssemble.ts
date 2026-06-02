import { useCallback, useEffect, useRef, useState } from "react";
import { assemble, type AssembleResult, type SourceFile } from "../lib/mads";
import { runRecipes } from "../lib/converters/recipeEngine";
import type { Recipe } from "../lib/converters/types";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

interface Args {
  files: ProjectFile[] | null;
  main: string | null;
  recipes: Recipe[] | null | undefined;
  projectId: string | null;
}

interface UseAutoAssembleResult {
  result: AssembleResult | null;
  setResult: (r: AssembleResult | null) => void;
  busy: boolean;
  /** Force-trigger an assemble now (skip the 400ms debounce). Returns
   *  the result whose seq is freshest at completion; stale builds are
   *  dropped silently and yield the latest committed result. */
  runAssemble: () => Promise<AssembleResult | null>;
}

/** Auto-assemble pipeline:
 *
 *   1. On every change to `files / main / recipes / projectId`, debounce
 *      400 ms then call `runAssemble`.
 *   2. `runAssemble` itself runs the recipe engine first (overlaying
 *      freshly-generated outputs on top of the in-IDB file list so the
 *      assembler sees them this build), then assembles the main file.
 *   3. A monotonically-increasing seq counter race-guards concurrent
 *      builds — only the latest one commits its result.
 *
 *  Caller can force-build (Ctrl+S, Run-without-result-yet) by awaiting
 *  the returned `runAssemble` directly. */
export function useAutoAssemble({ files, main, recipes, projectId }: Args): UseAutoAssembleResult {
  const [result, setResult] = useState<AssembleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);

  const runAssemble = useCallback(async (): Promise<AssembleResult | null> => {
    if (!files || !main || !projectId) return null;
    const seq = ++seqRef.current;
    setBusy(true);
    try {
      let augmented: SourceFile[] = files.map((f) => ({ path: f.path, content: f.content }));
      let recipeStderr = "";
      if (recipes && recipes.length > 0) {
        const results = await runRecipes(projectId, recipes, files);
        const generatedByPath = new Map<string, Uint8Array>();
        for (const r of results) {
          if (r.output) generatedByPath.set(r.output.path, r.output.bytes);
          if (!r.ok) recipeStderr += `[recipe] ${r.recipe.converter} (${r.recipe.input} → ${r.recipe.output}): ${r.error}\n`;
        }
        if (generatedByPath.size > 0) {
          const overlaid: SourceFile[] = [];
          const seen = new Set<string>();
          for (const f of augmented) {
            if (generatedByPath.has(f.path)) {
              overlaid.push({ path: f.path, content: generatedByPath.get(f.path)! });
              seen.add(f.path);
            } else {
              overlaid.push(f);
            }
          }
          for (const [path, bytes] of generatedByPath) {
            if (!seen.has(path)) overlaid.push({ path, content: bytes });
          }
          augmented = overlaid;
        }
      }
      const r = await assemble(main, augmented, ["-i:."]);
      if (seq === seqRef.current) {
        if (recipeStderr) r.stderr = recipeStderr + r.stderr;
        setResult(r);
      }
      return r;
    } catch (e) {
      const r: AssembleResult = {
        ok: false, stdout: "", stderr: `[runtime] ${String(e)}`, exitCode: 1,
      };
      if (seq === seqRef.current) setResult(r);
      return r;
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, [files, main, recipes, projectId]);

  useEffect(() => {
    const id = setTimeout(() => { void runAssemble(); }, 400);
    return () => clearTimeout(id);
  }, [runAssemble]);

  return { result, setResult, busy, runAssemble };
}
