// StorageBackend port — the complete persistence seam. IndexedDB is the current
// implementation (@adapters/storage-idb); an in-memory adapter backs tests and
// the headless workbench. Later: remote/server sync, OPFS / File System Access.
//
// Supersedes the old `ProjectRepository` (projects+snapshots only, Result-typed,
// never called). This port covers everything the app actually persists and uses
// the *throwing* convention — the data layer (store.ts) is written that way, so
// adapters throw `StorageError` on failure and the boundary try/catches.
//
// Domain shapes live here (not in @adapters) so UI/app layers reference @ports,
// never reach into an adapter. The IDB adapter re-exports these for continuity.

import type { ProjectManifestV2 } from './project-manifest'
import type { SourceMap } from './source-map'
import type { BuildDiagnostic } from './diagnostics'
import type { DebugInfo } from './debug-info'

// === domain shapes ===

export interface ProjectRow {
  id: string // ULID-ish; for now: slugified name + suffix on collision
  name: string
  createdAt: number
  updatedAt: number
}

export interface FileRow {
  projectId: string
  path: string // POSIX, no leading slash. e.g. "src/main.asm" or "project.json".
  content: Uint8Array // text encoded as UTF-8; binary native.
  updatedAt: number
}

/** A persisted file without its owning project — what build inputs and exports
 *  carry. `FileRow` is this plus `projectId`. */
export interface ProjectFile {
  path: string
  content: Uint8Array
  updatedAt: number
}

/** A file as supplied to create/snapshot — bytes keyed by path, no metadata. */
export interface ProjectFileInput {
  path: string
  content: Uint8Array
}

/** A fully-loaded project: row + parsed manifest + every file (manifest included). */
export interface LoadedProject {
  project: ProjectRow
  manifest: ProjectManifestV2
  files: FileRow[]
}

/** Snapshot metadata + tree. Contents are content-addressable: file bytes are
 *  hashed and stored once; the tree maps path → blob hash. */
export interface SnapshotMeta {
  id: string
  projectId: string
  ts: number
  summary: string
  tree: Record<string, string> // path → blob hash
}

/** A file fed into a snapshot. */
export interface SnapshotInput {
  path: string
  content: Uint8Array
}

export interface SnapshotDiff {
  added: string[] // paths only in `b`
  removed: string[] // paths only in `a`
  modified: string[] // paths in both with different hashes
  unchanged: number // count, not list
}

/** A course held in the courses store. `github` = installed from a remote git
 *  repo; `local` = a draft authored in-app (#139). Stored as course-root-relative
 *  files; the CourseSource rebuilds the bundle on read. */
export interface InstalledCourseRow {
  /** Stable id, e.g. "gh:owner/repo@ref" or "local:<uuid>". Also the course id. */
  sourceId: string
  kind: 'github' | 'local'
  /** GitHub provenance (absent for local drafts). */
  owner?: string
  repo?: string
  /** Requested ref (branch/tag/commit); "" means the repo default branch. */
  ref?: string
  /** Concrete version jsDelivr resolved the ref to (for display/immutability). */
  resolvedRef?: string
  fetchedAt: number
  /** Course-root-relative files (course.json + lessons/**), text content. */
  files: { path: string; content: string }[]
}

/** Breakpoints in memory: file path → set of 1-based line numbers. */
export type BreakpointsMap = Map<string, Set<number>>
/** Serialized breakpoints: file path → list of 1-based line numbers. */
export type BreakpointsRecord = Record<string, number[]>

// === sub-stores ===

export interface ProjectStore {
  list(): Promise<ProjectRow[]>
  load(id: string): Promise<LoadedProject | null>
  create(name: string, files: ProjectFileInput[], manifest: ProjectManifestV2): Promise<ProjectRow>
  rename(id: string, requestedName: string): Promise<string>
  duplicate(id: string, requestedName?: string): Promise<ProjectRow>
  delete(id: string): Promise<void>
  // file CRUD, scoped to a project
  writeFile(projectId: string, path: string, content: Uint8Array): Promise<void>
  createFile(projectId: string, path: string, content?: Uint8Array): Promise<void>
  deleteFile(projectId: string, path: string): Promise<void>
  renameFile(projectId: string, oldPath: string, newPath: string): Promise<void>
  renameFolder(projectId: string, oldPrefix: string, newPrefix: string): Promise<void>
  deleteFolder(projectId: string, prefix: string): Promise<void>
  saveManifest(projectId: string, manifest: ProjectManifestV2): Promise<void>
}

export interface SnapshotStore {
  /** Returns null when nothing changed since the latest snapshot (dedup). */
  create(projectId: string, summary: string, files: SnapshotInput[]): Promise<SnapshotMeta | null>
  list(projectId: string): Promise<SnapshotMeta[]>
  restore(projectId: string, snapshot: SnapshotMeta): Promise<void>
  delete(id: string): Promise<void>
  clearForProject(projectId: string): Promise<void>
  /** Keep N most recent auto-snapshots; returns how many were pruned. */
  pruneAuto(projectId: string, keep: number): Promise<number>
  /** Drop blobs referenced by no snapshot; returns how many were collected. */
  gcOrphanBlobs(): Promise<number>
  /** Pure tree diff — no I/O. */
  diff(a: SnapshotMeta, b: SnapshotMeta): SnapshotDiff
}

export interface BreakpointStore {
  load(projectId: string): Promise<BreakpointsMap>
  save(projectId: string, bps: BreakpointsMap): Promise<void>
  clear(projectId: string): Promise<void>
}

/** The last build of a project, persisted so a page reload restores the OUTPUT
 *  panel + inline error markers (and the binary, so Run works without a rebuild)
 *  instead of starting blank (#62). Maps/Uint8Array survive IDB structured
 *  clone, so the shape is stored as-is. Workflow state, not a project artifact —
 *  excluded from ZIP export. */
export interface StoredBuild {
  ok: boolean
  binary?: Uint8Array
  sourceMap?: SourceMap
  /** Per-CPU source maps for a multi-CPU build (Genesis Z80, #147). */
  sourceMaps?: Record<string, SourceMap>
  labels?: Map<string, number>
  debugInfo?: DebugInfo
  diagnostics?: BuildDiagnostic[]
  stdout: string
  stderr: string
  exitCode: number
}

export interface BuildStore {
  load(projectId: string): Promise<StoredBuild | undefined>
  save(projectId: string, build: StoredBuild): Promise<void>
  clear(projectId: string): Promise<void>
}

export interface CourseStore {
  install(row: InstalledCourseRow): Promise<void>
  list(): Promise<InstalledCourseRow[]>
  get(sourceId: string): Promise<InstalledCourseRow | undefined>
  remove(sourceId: string): Promise<void>
}

/** Key/value meta: the active-project pointer (also mirrored in the URL) plus the
 *  global set of trusted project-local plugin hashes (ADR-0013). Generic get/set
 *  is still deferred — these consumers get named methods. */
export interface KeyValueStore {
  getActiveProjectId(): Promise<string | undefined>
  setActiveProjectId(id: string): Promise<void>
  /** sha256 hex of every project-local plugin (editors/converters `*.js`) the
   *  user has consented to run — trust is keyed on code, not project/path. */
  getTrustedPluginHashes(): Promise<string[]>
  /** Record consent for a plugin's exact content hash. Idempotent. */
  addTrustedPluginHash(hash: string): Promise<void>
}

export interface StorageBackend {
  projects: ProjectStore
  snapshots: SnapshotStore
  breakpoints: BreakpointStore
  builds: BuildStore
  courses: CourseStore
  kv: KeyValueStore
}
