// IDB schema + open. Single source of truth for store layout lives in
// ./schema.ts; per-version upgrade steps live in ./migrations.ts. Bumping
// the schema = one new entry in the migrations array.

import { openDB, type IDBPDatabase } from "idb";
import { latestVersion, runUpgrade } from "./migrations";
import type { MadsideDB } from "./schema";

export type { MadsideDB } from "./schema";

let dbPromise: Promise<IDBPDatabase<MadsideDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MadsideDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MadsideDB>("madside", latestVersion(), {
      upgrade(db, oldVersion, _newVersion, tx) {
        runUpgrade(db, oldVersion, tx);
      },
    });
  }
  return dbPromise;
}

/** Close the cached DB handle (next getDB() reopens). Used by test fixtures
 *  that wipe the underlying IDBFactory between cases; production code has no
 *  reason to call this. */
export async function __resetDb(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* already closed */
    }
    dbPromise = null;
  }
}
