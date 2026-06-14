// Schema shape — extracted so the migration runner can import it without
// pulling in `db.ts` (which already imports the migration runner). Splitting
// these two avoids a madge circular even though the cross-import is type-only.

import type { DBSchema } from "idb";
import type { BreakpointsRow, FileRow, InstalledCourseRow, MetaRow, ProjectRow } from "./types";

export interface MadsideDB extends DBSchema {
  projects: {
    key: string;                         // ProjectRow.id
    value: ProjectRow;
    indexes: { byUpdatedAt: number };
  };
  files: {
    key: [string, string];               // [projectId, path]
    value: FileRow;
    indexes: { byProject: string };
  };
  meta: {
    key: string;
    value: MetaRow;
  };
  snapshots: {
    key: string;
    value: { id: string; projectId: string; ts: number; summary: string; tree: Record<string, string> };
    indexes: { byProject: string };
  };
  blobs: {
    key: string;                         // sha-256 hex
    value: { hash: string; data: Uint8Array };
  };
  breakpoints: {
    key: string;                         // projectId
    value: BreakpointsRow;
  };
  courses: {
    key: string;                         // InstalledCourseRow.sourceId
    value: InstalledCourseRow;
  };
}
