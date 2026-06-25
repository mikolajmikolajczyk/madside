import { useEffect, useState } from "react";
import type { StorageBackend } from "@ports";

export interface AnnotatedProject {
  id: string;
  name: string;
  updatedAt: number;
  /** Manifest fields surfaced on the welcome card (machine/toolchain badge +
   *  entry file). Loaded for free — the manifest is read here anyway. Absent if
   *  the load failed. */
  machine?: string;
  toolchain?: string;
  main?: string;
  /** Set when the project is a course lesson (`manifest.course`) — used to split
   *  course progress out of the plain project list on the welcome screen. */
  course?: { id: string; lesson: string };
}

interface ProjectRowLite {
  id: string;
  name: string;
  updatedAt: number;
}

/** Annotate the project rows with their `manifest.course` so the welcome screen
 *  can separate "Your projects" from "Started courses". ProjectRow doesn't carry
 *  the manifest, so each project's manifest is loaded once (welcome lists are
 *  small); re-runs only when the set of (id, updatedAt) changes. */
export function useProjectsWithCourse(storage: StorageBackend, rows: ProjectRowLite[]): AnnotatedProject[] {
  const [annotated, setAnnotated] = useState<AnnotatedProject[]>([]);
  // Stable key so the effect re-runs on a real change, not every render (App
  // maps a fresh array each time).
  const key = rows.map((r) => `${r.id}:${r.updatedAt}`).join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out = await Promise.all(
        rows.map(async (r): Promise<AnnotatedProject> => {
          try {
            const loaded = await storage.projects.load(r.id);
            const m = loaded?.manifest;
            return { id: r.id, name: r.name, updatedAt: r.updatedAt, machine: m?.machine, toolchain: m?.toolchain, main: m?.main, course: m?.course };
          } catch {
            return { id: r.id, name: r.name, updatedAt: r.updatedAt };
          }
        }),
      );
      if (!cancelled) setAnnotated(out);
    })();
    return () => { cancelled = true; };
    // `key` encodes the relevant `rows` contents; depending on `rows` directly
    // would re-run every render (new array identity from App's map).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storage]);

  return annotated;
}
