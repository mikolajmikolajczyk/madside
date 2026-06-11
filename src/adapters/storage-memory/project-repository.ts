import type {
  Project,
  ProjectMeta,
  ProjectRepository,
  Result,
  Snapshot,
  SnapshotMeta,
  StorageError,
} from '@ports'
import { StorageError as StorageErrorClass, err, ok } from '@ports'
import { sha256Hex } from '@core/hash'

// In-memory ProjectRepository — used by the headless workbench and by tests.
// Mirrors the IDB schema closely so the contract test (ADR-0005) can run
// against both adapters and assert identical behaviour.

interface State {
  projects: Map<string, Project>
  snapshots: Map<string, Snapshot>
  blobs: Map<string, Uint8Array>
}

const clone = (project: Project): Project => ({
  ...project,
  files: project.files.map((f) => ({ ...f, content: new Uint8Array(f.content) })),
  manifest: { ...project.manifest },
})

const cloneSnap = (snap: Snapshot): Snapshot => ({
  ...snap,
  tree: { ...snap.tree },
  manifest: { ...snap.manifest },
})

const toMeta = (p: Project): ProjectMeta => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

const toSnapMeta = (s: Snapshot): SnapshotMeta => ({
  id: s.id,
  projectId: s.projectId,
  ts: s.ts,
  summary: s.summary,
})

export function createMemoryProjectRepository(): ProjectRepository {
  const state: State = {
    projects: new Map(),
    snapshots: new Map(),
    blobs: new Map(),
  }

  const missing = (what: string): Result<never, StorageError> =>
    err(new StorageErrorClass(`${what} not found`))

  return {
    async listProjects() {
      return ok([...state.projects.values()].map(toMeta))
    },

    async loadProject(id) {
      const p = state.projects.get(id)
      if (!p) return missing(`project ${id}`)
      return ok(clone(p))
    },

    async saveProject(project) {
      state.projects.set(project.id, clone({ ...project, updatedAt: Date.now() }))
      return ok(undefined)
    },

    async deleteProject(id) {
      if (!state.projects.delete(id)) return missing(`project ${id}`)
      for (const [snapId, snap] of state.snapshots) {
        if (snap.projectId === id) state.snapshots.delete(snapId)
      }
      return ok(undefined)
    },

    async snapshot(projectId, summary) {
      const project = state.projects.get(projectId)
      if (!project) return missing(`project ${projectId}`)
      const tree: Record<string, string> = {}
      for (const f of project.files) {
        const hash = await sha256Hex(f.content)
        tree[f.path] = hash
        if (!state.blobs.has(hash)) state.blobs.set(hash, new Uint8Array(f.content))
      }
      const snap: Snapshot = {
        id: crypto.randomUUID(),
        projectId,
        ts: Date.now(),
        summary,
        tree,
        manifest: { ...project.manifest },
      }
      state.snapshots.set(snap.id, snap)
      return ok(toSnapMeta(snap))
    },

    async listSnapshots(projectId) {
      return ok(
        [...state.snapshots.values()]
          .filter((s) => s.projectId === projectId)
          .sort((a, b) => b.ts - a.ts)
          .map(toSnapMeta),
      )
    },

    async restoreSnapshot(snapshotId) {
      const snap = state.snapshots.get(snapshotId)
      if (!snap) return missing(`snapshot ${snapshotId}`)
      const project = state.projects.get(snap.projectId)
      if (!project) return missing(`project ${snap.projectId}`)
      const files: Project['files'] = []
      for (const [path, hash] of Object.entries(snap.tree)) {
        const blob = state.blobs.get(hash)
        if (!blob) return err(new StorageErrorClass(`blob ${hash} missing for snapshot ${snapshotId}`))
        files.push({ path, content: new Uint8Array(blob), updatedAt: Date.now() })
      }
      state.projects.set(project.id, clone({ ...project, files, manifest: { ...snap.manifest }, updatedAt: Date.now() }))
      return ok(undefined)
    },

    async deleteSnapshot(snapshotId) {
      if (!state.snapshots.delete(snapshotId)) return missing(`snapshot ${snapshotId}`)
      return ok(undefined)
    },
  }
}

// Re-export cloneSnap for tests that want to inspect snapshots without
// risking state mutation via shared references.
export const __internal = { cloneSnap }
