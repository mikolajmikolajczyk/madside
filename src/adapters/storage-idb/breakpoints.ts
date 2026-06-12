// Per-project breakpoint persistence. Stored in IDB so reloads survive.
// Not included in ZIP export — BPs are workflow state, not a project artifact.
//
// The UI keeps breakpoints as `Map<string, Set<number>>` (cheap dedup, fast
// lookups). The IDB row persists `Record<string, number[]>` (structured-clone
// friendly, jq-greppable in devtools). Both directions live in one place
// here so adding BP-adjacent fields doesn't drift the two shapes apart.

import { getDB } from "./db";

export type BreakpointsMap = Map<string, Set<number>>;
export type BreakpointsRecord = Record<string, number[]>;

/** Map → Record: drops empty files, sorts lines ascending for stable storage. */
export function bpsToRecord(bps: BreakpointsMap): BreakpointsRecord {
  const out: BreakpointsRecord = {};
  for (const [path, lines] of bps) {
    if (lines.size === 0) continue;
    out[path] = Array.from(lines).sort((a, b) => a - b);
  }
  return out;
}

/** Record → Map: drops empty arrays so the in-memory map stays minimal. */
export function recordToBps(record: BreakpointsRecord): BreakpointsMap {
  const out: BreakpointsMap = new Map();
  for (const [path, lines] of Object.entries(record)) {
    if (lines.length > 0) out.set(path, new Set(lines));
  }
  return out;
}

export async function loadBreakpoints(projectId: string): Promise<BreakpointsMap> {
  const db = await getDB();
  const row = await db.get("breakpoints", projectId);
  return row ? recordToBps(row.bps) : new Map();
}

export async function saveBreakpoints(projectId: string, bps: BreakpointsMap): Promise<void> {
  const db = await getDB();
  await db.put("breakpoints", { projectId, bps: bpsToRecord(bps), updatedAt: Date.now() });
}

export async function clearBreakpoints(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete("breakpoints", projectId);
}
