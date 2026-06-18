import type { ProjectManifestV2 } from "@ports";
// Persisted shapes. Schema version bumps go through ./migrations.ts.
//
// The storage *domain* shapes (ProjectRow, FileRow, InstalledCourseRow) live in
// @ports/storage now — the canonical home so UI/app reference the port, not this
// adapter. Re-exported here for continuity (`@adapters/storage-idb` keeps its
// type API). The remaining shapes (MetaRow, BreakpointsRow) are IDB-only
// persistence details and stay local.

export type { FileRow, InstalledCourseRow, ProjectRow, StoredBuild } from "@ports";
import type { StoredBuild } from "@ports";

/** Manifest type alias — IDB persists the v2 shape verbatim. Validation +
 *  v1 rejection happens at read time via parseProjectManifest. */
export type Manifest = ProjectManifestV2;

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

export interface BuildRow {
  projectId: string;
  // The last build, stored as-is — Uint8Array (binary) and Map (labels,
  // sourceMap) round-trip through IDB structured clone (#62).
  build: StoredBuild;
  updatedAt: number;
}
