// Per-project history. Snapshots are content-addressable: file contents are
// hashed (sha-256) and stored in the shared `blobs` table; snapshots only
// reference hashes. Unchanged files dedupe automatically.

import { getDB } from "./db";
import { sha256Hex } from "@core/hash";
import { AUTO_KEEP, diffSnapshots, newSnapshotId, sameTree } from "@madside/storage-shared";
import type { SnapshotDiff, SnapshotInput, SnapshotMeta } from "@ports";

// Canonical shapes live in @ports/storage; re-export so `@adapters/storage-idb`
// keeps surfacing them. Shared persistence helpers (id/diff/sameTree/AUTO_KEEP)
// live in @adapters/storage-shared so the memory adapter can't drift (#19).
export type { SnapshotDiff, SnapshotInput, SnapshotMeta };
export { diffSnapshots };

export async function createSnapshot(
  projectId: string,
  summary: string,
  files: SnapshotInput[],
): Promise<SnapshotMeta | null> {
  const db = await getDB();
  const tree: Record<string, string> = {};
  const newBlobs: { hash: string; data: Uint8Array }[] = [];
  for (const f of files) {
    const hash = await sha256Hex(f.content);
    tree[f.path] = hash;
    const existing = await db.get("blobs", hash);
    if (!existing) newBlobs.push({ hash, data: f.content });
  }
  // Dedup vs latest snapshot — identical tree means nothing changed.
  const recent = await db.getAllFromIndex("snapshots", "byProject", projectId);
  if (recent.length > 0) {
    const last = recent.sort((a, b) => b.ts - a.ts)[0];
    if (sameTree(last.tree, tree)) return null;
  }
  const ts = Date.now();
  const id = newSnapshotId(projectId, ts);
  const snapshot: SnapshotMeta = { id, projectId, ts, summary, tree };
  const tx = db.transaction(["snapshots", "blobs"], "readwrite");
  for (const b of newBlobs) await tx.objectStore("blobs").put(b);
  await tx.objectStore("snapshots").put(snapshot);
  await tx.done;
  await pruneAutoSnapshots(projectId, AUTO_KEEP);
  return snapshot;
}

export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("snapshots", "byProject", projectId);
  return all.sort((a, b) => b.ts - a.ts);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("snapshots", id);
  await gcOrphanBlobs();
}

export async function clearSnapshotsForProject(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("snapshots", "readwrite");
  const keys = await tx.store.index("byProject").getAllKeys(projectId);
  for (const k of keys) await tx.store.delete(k);
  await tx.done;
  await gcOrphanBlobs();
}

// Drop oldest auto-snapshots beyond `keep`. Manual snapshots are immune.
export async function pruneAutoSnapshots(projectId: string, keep: number): Promise<number> {
  const db = await getDB();
  const all = await db.getAllFromIndex("snapshots", "byProject", projectId);
  const autos = all.filter((s) => s.summary !== "manual").sort((a, b) => b.ts - a.ts);
  if (autos.length <= keep) return 0;
  const drop = autos.slice(keep);
  const tx = db.transaction("snapshots", "readwrite");
  for (const s of drop) await tx.store.delete(s.id);
  await tx.done;
  await gcOrphanBlobs();
  return drop.length;
}

// Walk every snapshot tree, collect referenced hashes, delete unreferenced
// blobs. Files in active projects still own their bytes via the `files` store,
// so blobs there don't need protection — `files.content` is separate storage.
export async function gcOrphanBlobs(): Promise<number> {
  const db = await getDB();
  const snaps = await db.getAll("snapshots");
  const refs = new Set<string>();
  for (const s of snaps) for (const h of Object.values(s.tree)) refs.add(h);
  const tx = db.transaction("blobs", "readwrite");
  let removed = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (!refs.has(cursor.key as string)) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

// Overwrite the project's files with the snapshot contents. Files not in the
// snapshot get deleted so the project ends up byte-identical to the snapshot.
export async function restoreSnapshot(projectId: string, snapshot: SnapshotMeta): Promise<void> {
  const db = await getDB();
  const blobs = new Map<string, Uint8Array>();
  for (const [path, hash] of Object.entries(snapshot.tree)) {
    const row = await db.get("blobs", hash);
    if (row) blobs.set(path, row.data);
  }
  const tx = db.transaction(["files", "projects"], "readwrite");
  const filesStore = tx.objectStore("files");
  const existing = await filesStore.index("byProject").getAllKeys(projectId);
  for (const k of existing) await filesStore.delete(k);
  const now = Date.now();
  for (const [path, bytes] of blobs) {
    await filesStore.put({ projectId, path, content: bytes, updatedAt: now });
  }
  const project = await tx.objectStore("projects").get(projectId);
  if (project) { project.updatedAt = now; await tx.objectStore("projects").put(project); }
  await tx.done;
}
