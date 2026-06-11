// ProjectRepository port — decouples storage. IDB adapter (current) and an
// in-memory adapter (test fixture) implement this. Phase 10 FSA adapter
// arrives later.

import type { Result, StorageError } from './errors'
import type { ProjectManifestV2 } from './project-manifest'

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface ProjectFile {
  path: string
  content: Uint8Array
  updatedAt: number
}

export interface Project extends ProjectMeta {
  files: ProjectFile[]
  /** Parsed + validated project.json (v2). Loader rejects v1 with a clear
   *  ManifestError before this type is constructed. */
  manifest: ProjectManifestV2
}

export interface SnapshotMeta {
  id: string
  projectId: string
  ts: number
  summary?: string
}

export interface Snapshot extends SnapshotMeta {
  /** Map of file path → content hash. Bytes live in the content-addressable
   *  blob store; this is just the tree. */
  tree: Record<string, string>
  manifest: ProjectManifestV2
}

export interface ProjectRepository {
  listProjects(): Promise<Result<ProjectMeta[], StorageError>>
  loadProject(id: string): Promise<Result<Project, StorageError>>
  saveProject(project: Project): Promise<Result<void, StorageError>>
  deleteProject(id: string): Promise<Result<void, StorageError>>

  snapshot(projectId: string, summary?: string): Promise<Result<SnapshotMeta, StorageError>>
  listSnapshots(projectId: string): Promise<Result<SnapshotMeta[], StorageError>>
  restoreSnapshot(snapshotId: string): Promise<Result<void, StorageError>>
  deleteSnapshot(snapshotId: string): Promise<Result<void, StorageError>>
}
