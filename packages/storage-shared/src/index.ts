// Shared persistence semantics for the StorageBackend adapters (idb + memory).
// One source of truth so the two adapters can't drift (issue #19): id/slug
// generation, manifest serialization, name disambiguation, and tree compare/diff
// all live here instead of being reimplemented per adapter.

import type { ProjectManifestV2, ProjectRow, SnapshotDiff, SnapshotMeta } from "@ports";

export const MANIFEST_PATH = "project.json";

const enc = new TextEncoder();
const dec = new TextDecoder();
/** UTF-8 encode — file content is stored as bytes (structured-clone safe). */
export function textToBytes(s: string): Uint8Array { return enc.encode(s); }
/** UTF-8 decode a stored file's bytes back to text. */
export function bytesToText(b: Uint8Array): string { return dec.decode(b); }

/** Structural guard for a persisted project row — used to quarantine a corrupt
 *  IDB record on read instead of flowing a malformed row into typed state
 *  (ADR-0004, #12). */
export function isProjectRow(v: unknown): v is ProjectRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}

/** Keep N most recent auto-snapshots per project; "manual" ones never pruned. */
export const AUTO_KEEP = 100;

export function newProjectId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  return `${slug}-${Date.now().toString(36)}`;
}

/** randomUUID, not a 1000-bucket RNG: two snapshots in the same ms must not
 *  collide and silently overwrite each other's history. */
export function newSnapshotId(projectId: string, ts: number): string {
  return `${projectId}::${ts.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function serializeManifest(manifest: ProjectManifestV2): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** Disambiguate `name` against a taken-set, bumping a " (n)" suffix. */
export function uniquify(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const m = /^(.*?)(?:\s*\((\d+)\))?$/.exec(name);
  const base = (m?.[1] ?? name).trim();
  let n = m?.[2] ? parseInt(m[2], 10) + 1 : 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export function sameTree(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

export function diffSnapshots(a: SnapshotMeta, b: SnapshotMeta): SnapshotDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  let unchanged = 0;
  for (const path of Object.keys(b.tree)) {
    if (!(path in a.tree)) added.push(path);
    else if (a.tree[path] !== b.tree[path]) modified.push(path);
    else unchanged++;
  }
  for (const path of Object.keys(a.tree)) {
    if (!(path in b.tree)) removed.push(path);
  }
  added.sort();
  removed.sort();
  modified.sort();
  return { added, removed, modified, unchanged };
}
