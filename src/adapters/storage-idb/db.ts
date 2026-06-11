// IDB schema + open. Single source of truth for store layout.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SCHEMA_VERSION } from "./types";

export interface MadsideDB extends DBSchema {
  projects: {
    key: string;                         // ProjectRow.id
    value: import("./types").ProjectRow;
    indexes: { byUpdatedAt: number };
  };
  files: {
    key: [string, string];               // [projectId, path]
    value: import("./types").FileRow;
    indexes: { byProject: string };
  };
  meta: {
    key: string;
    value: import("./types").MetaRow;
  };
  // Phase 4 additions placeholder — created now to avoid future migration churn.
  snapshots: {
    key: string;
    value: { id: string; projectId: string; ts: number; summary: string; tree: Record<string, string> };
    indexes: { byProject: string };
  };
  blobs: {
    key: string;                         // sha-256 hex
    value: { hash: string; data: Uint8Array };
  };
  // v2: per-project breakpoint persistence.
  breakpoints: {
    key: string;                         // projectId
    value: import("./types").BreakpointsRow;
  };
}

let dbPromise: Promise<IDBPDatabase<MadsideDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MadsideDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MadsideDB>("madside", SCHEMA_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore("projects", { keyPath: "id" });
          projects.createIndex("byUpdatedAt", "updatedAt");

          const files = db.createObjectStore("files", { keyPath: ["projectId", "path"] });
          files.createIndex("byProject", "projectId");

          db.createObjectStore("meta", { keyPath: "key" });

          const snapshots = db.createObjectStore("snapshots", { keyPath: "id" });
          snapshots.createIndex("byProject", "projectId");

          db.createObjectStore("blobs", { keyPath: "hash" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("breakpoints", { keyPath: "projectId" });
        }
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
