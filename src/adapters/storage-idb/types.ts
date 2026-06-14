import type { ProjectManifestV2 } from "@ports";
// Persisted shapes. Schema version bumps go through ./migrations.ts.

/** Manifest type alias — IDB persists the v2 shape verbatim. Validation +
 *  v1 rejection happens at read time via parseProjectManifest. */
export type Manifest = ProjectManifestV2;

/** A course installed from a remote git repo (epic ecd5258). Stored as the raw
 *  course-root-relative files; the CourseSource rebuilds the bundle on read. */
export interface InstalledCourseRow {
  /** Stable id, e.g. "gh:owner/repo@ref". Also the course id in the registry. */
  sourceId: string;
  kind: "github";
  owner: string;
  repo: string;
  /** Requested ref (branch/tag/commit); "" means the repo default branch. */
  ref: string;
  /** Concrete version jsDelivr resolved the ref to (for display/immutability). */
  resolvedRef?: string;
  fetchedAt: number;
  /** Course-root-relative files (course.json + lessons/**), text content. */
  files: { path: string; content: string }[];
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
