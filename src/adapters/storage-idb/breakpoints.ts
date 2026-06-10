// Per-project breakpoint persistence. Stored in IDB so reloads survive.
// Not included in ZIP export — BPs are workflow state, not a project artifact.

import { getDB } from "./db";

export async function loadBreakpoints(projectId: string): Promise<Map<string, Set<number>>> {
  const db = await getDB();
  const row = await db.get("breakpoints", projectId);
  const out = new Map<string, Set<number>>();
  if (!row) return out;
  for (const [path, lines] of Object.entries(row.bps)) {
    if (lines.length > 0) out.set(path, new Set(lines));
  }
  return out;
}

export async function saveBreakpoints(projectId: string, bps: Map<string, Set<number>>): Promise<void> {
  const db = await getDB();
  const record: Record<string, number[]> = {};
  for (const [path, lines] of bps) {
    if (lines.size === 0) continue;
    record[path] = Array.from(lines).sort((a, b) => a - b);
  }
  await db.put("breakpoints", { projectId, bps: record, updatedAt: Date.now() });
}

export async function clearBreakpoints(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete("breakpoints", projectId);
}
