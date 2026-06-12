// IDB schema migration framework. Each version bump appends one entry to
// `migrations[]`; the runner walks them in order whenever `openDB` fires its
// upgrade callback. Adding a v3 migration is one entry — no manual fiddling
// of SCHEMA_VERSION or the upgrade body.
//
// v1 → v2 baseline note: there are no production v1 databases (the workbench
// shipped no public release at v1), so the runner *replaces* any pre-v2 store
// set wholesale with the v2 baseline instead of running a per-step migration.
// All migrations from v3 onward run normally.

import type { IDBPDatabase } from "idb";
import type { MadsideDB } from "./schema";

/** The upgrade transaction shape — left loose so future migrations that need
 *  to read+rewrite a store can grab it without dragging the full `idb`
 *  generic-tuple gymnastics into every migration entry. The runner threads
 *  whatever `openDB` hands it. */
export type UpgradeTx = unknown;

export interface Migration {
  /** Schema version this migration produces. Strictly monotonically
   *  increasing across the array. */
  v: number;
  /** Short human-readable note — appears in the upgrade log if anything trips
   *  while the migration runs. */
  description: string;
  /** Runs inside the upgrade transaction. Synchronous IDB ops only. */
  run: (db: IDBPDatabase<MadsideDB>, tx: UpgradeTx) => void;
}

/** v2 baseline — every store created from scratch. Pre-v2 dbs get any
 *  existing stores torn down first so this runs on a clean slate. */
export function applyBaseline(db: IDBPDatabase<MadsideDB>): void {
  const projects = db.createObjectStore("projects", { keyPath: "id" });
  projects.createIndex("byUpdatedAt", "updatedAt");

  const files = db.createObjectStore("files", { keyPath: ["projectId", "path"] });
  files.createIndex("byProject", "projectId");

  db.createObjectStore("meta", { keyPath: "key" });

  const snapshots = db.createObjectStore("snapshots", { keyPath: "id" });
  snapshots.createIndex("byProject", "projectId");

  db.createObjectStore("blobs", { keyPath: "hash" });
  db.createObjectStore("breakpoints", { keyPath: "projectId" });
}

/** Schema versions produced after the v2 baseline. Append one entry per bump;
 *  the runner picks the highest `v` and runs every entry whose `v` exceeds
 *  the user's stored version. */
export const migrations: Migration[] = [
  // Example shape for future bumps:
  // {
  //   v: 3,
  //   description: 'rename meta.activeProjectId to meta.activeProject',
  //   run(db) { /* … */ },
  // },
];

/** Highest schema version the workbench supports. Derived so adding a
 *  migration entry is the only place a contributor has to touch. */
export function latestVersion(): number {
  return migrations.reduce((max, m) => Math.max(max, m.v), 2);
}

/** Upgrade entrypoint. Used by `getDB()`; exported so the migration test
 *  suite can drive it against an in-memory DB without going through openDB. */
export function runUpgrade(
  db: IDBPDatabase<MadsideDB>,
  oldVersion: number,
  tx: UpgradeTx,
): void {
  if (oldVersion < 2) {
    for (const name of Array.from(db.objectStoreNames)) {
      db.deleteObjectStore(name);
    }
    applyBaseline(db);
  }
  for (const m of migrations) {
    if (m.v > oldVersion) m.run(db, tx);
  }
}
