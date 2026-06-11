import type { Recipe } from "@ports";
// Persisted shapes. Schema version bumps require a migration in db.ts.

export const SCHEMA_VERSION = 2;

export interface Manifest {
  version: 1;
  name: string;
  main: string;                          // e.g. "src/main.asm"
  run?: { default?: { audio?: boolean } };
  recipes?: Recipe[];
  /** Map of file extension (no dot, lowercase) → path of editor module under `editors/`. */
  editors?: Record<string, string>;
}

export interface ProjectRow {
  id: string;                            // ULID-ish; for now: slugified name + suffix on collision
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface FileRow {
  projectId: string;
  path: string;                          // POSIX, no leading slash. e.g. "src/main.asm" or "project.json".
  content: Uint8Array;                   // text encoded as UTF-8; binary native.
  updatedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface BreakpointsRow {
  projectId: string;
  // Map file path → list of 1-based line numbers. Stored as a plain record for
  // easy IDB serialization (Maps round-trip via structured clone but objects
  // play nicer with debugging tools).
  bps: Record<string, number[]>;
  updatedAt: number;
}
