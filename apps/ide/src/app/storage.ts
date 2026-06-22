// App-wide StorageBackend. A single IDB-backed instance the data layer
// (state/store), templates, and courses all share. Consumers call the port —
// never the raw adapter functions — so a future backend (remote sync, OPFS /
// File System Access) is a one-line swap here.

import { createIdbStorage } from "@madside/storage-idb";
import type { SnapshotDiff, SnapshotMeta, StorageBackend } from "@ports";

export const storage: StorageBackend = createIdbStorage();

/** Pure snapshot tree-diff, routed through the port so the UI never imports it
 *  from an adapter (ADR-0002 — `ui → adapters` is forbidden). */
export const diffSnapshots = (a: SnapshotMeta, b: SnapshotMeta): SnapshotDiff =>
  storage.snapshots.diff(a, b);
