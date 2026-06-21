// Per-project last-build persistence (#62). Stored in IDB so a page reload
// restores the OUTPUT panel + inline error markers + the binary (Run without a
// rebuild) instead of starting blank. Workflow state, not a project artifact —
// not included in ZIP export.
//
// StoredBuild holds Uint8Array (binary) and Map (labels, sourceMap); all
// round-trip through IDB structured clone, so the row is stored as-is.

import { getDB } from "./db";
import type { StoredBuild } from "@ports";

export async function loadBuild(projectId: string): Promise<StoredBuild | undefined> {
  const db = await getDB();
  const row = await db.get("builds", projectId);
  return row?.build;
}

export async function saveBuild(projectId: string, build: StoredBuild): Promise<void> {
  const db = await getDB();
  await db.put("builds", { projectId, build, updatedAt: Date.now() });
}

export async function clearBuild(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete("builds", projectId);
}
