import type {
  Project,
  ProjectFile,
  ProjectMeta,
  ProjectRepository,
  Result,
  SnapshotMeta,
} from '@ports'
import { StorageError, err, ok } from '@ports'
import { getDB } from './db'
import {
  MANIFEST_PATH,
  bytesToText,
  textToBytes,
  loadProject as loadProjectRaw,
  listProjects as listProjectsRaw,
  deleteProject as deleteProjectRaw,
  type LoadedProject,
} from './project'
import {
  createSnapshot,
  deleteSnapshot as deleteSnapshotRaw,
  listSnapshots as listSnapshotsRaw,
  restoreSnapshot as restoreSnapshotRaw,
} from './snapshots'

// IdbProjectRepository — wraps the legacy IDB calls in the @ports/ProjectRepository
// shape. Existing direct callers under @app/state/store.ts continue to use the
// untyped helpers until M3 lifts them behind RunService / BuildService / etc.

const wrap = async <T>(label: string, fn: () => Promise<T>): Promise<Result<T, StorageError>> => {
  try {
    return ok(await fn())
  } catch (cause) {
    return err(new StorageError(`${label} failed`, cause))
  }
}

const fromLoaded = (loaded: LoadedProject): Project => {
  const files: ProjectFile[] = loaded.files.map((f) => ({
    path: f.path,
    content: new Uint8Array(f.content),
    updatedAt: f.updatedAt,
  }))
  return {
    id: loaded.project.id,
    name: loaded.project.name,
    createdAt: loaded.project.createdAt,
    updatedAt: loaded.project.updatedAt,
    files,
    manifest: loaded.manifest,
  }
}

export function createIdbProjectRepository(): ProjectRepository {
  return {
    async listProjects() {
      return wrap('listProjects', async () => {
        const rows = await listProjectsRaw()
        const out: ProjectMeta[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }))
        return out
      })
    },

    async loadProject(id) {
      return wrap('loadProject', async () => {
        const loaded = await loadProjectRaw(id)
        if (!loaded) throw new Error(`project ${id} not found`)
        return fromLoaded(loaded)
      })
    },

    async saveProject(project) {
      return wrap('saveProject', async () => {
        const db = await getDB()
        const tx = db.transaction(['projects', 'files'], 'readwrite')
        const projectsStore = tx.objectStore('projects')
        const filesStore = tx.objectStore('files')

        const updatedAt = Date.now()
        await projectsStore.put({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt,
        })

        // Replace files: scan existing, delete removed, upsert current.
        const existingKeys = await filesStore.index('byProject').getAllKeys(project.id)
        const wantedPaths = new Set(project.files.map((f) => f.path))
        for (const key of existingKeys) {
          const [, path] = key as [string, string]
          if (!wantedPaths.has(path)) await filesStore.delete(key)
        }

        const manifestBytes = textToBytes(JSON.stringify(project.manifest, null, 2))
        const hasManifest = project.files.some((f) => f.path === MANIFEST_PATH)
        const filesToWrite: ProjectFile[] = hasManifest
          ? project.files
          : [...project.files, { path: MANIFEST_PATH, content: manifestBytes, updatedAt }]

        for (const f of filesToWrite) {
          await filesStore.put({
            projectId: project.id,
            path: f.path,
            content: new Uint8Array(f.content),
            updatedAt: f.updatedAt || updatedAt,
          })
        }

        await tx.done
      })
    },

    async deleteProject(id) {
      return wrap('deleteProject', async () => {
        await deleteProjectRaw(id)
      })
    },

    async snapshot(projectId, summary) {
      return wrap('snapshot', async () => {
        const loaded = await loadProjectRaw(projectId)
        if (!loaded) throw new Error(`project ${projectId} not found`)
        const meta = await createSnapshot(
          projectId,
          summary ?? '',
          loaded.files.map((f) => ({ path: f.path, content: new Uint8Array(f.content) })),
        )
        if (!meta) throw new Error('snapshot deduped (no changes since last)')
        const out: SnapshotMeta = {
          id: meta.id,
          projectId: meta.projectId,
          ts: meta.ts,
          summary: meta.summary,
        }
        return out
      })
    },

    async listSnapshots(projectId) {
      return wrap('listSnapshots', async () => {
        const rows = await listSnapshotsRaw(projectId)
        return rows.map((m) => ({
          id: m.id,
          projectId: m.projectId,
          ts: m.ts,
          summary: m.summary,
        }))
      })
    },

    async restoreSnapshot(snapshotId) {
      return wrap('restoreSnapshot', async () => {
        const db = await getDB()
        const snap = await db.get('snapshots', snapshotId)
        if (!snap) throw new Error(`snapshot ${snapshotId} not found`)
        await restoreSnapshotRaw(snap.projectId, snap)
      })
    },

    async deleteSnapshot(snapshotId) {
      return wrap('deleteSnapshot', async () => {
        await deleteSnapshotRaw(snapshotId)
      })
    },
  }
}

// Re-export the byte helpers — Project consumers wrap text content via the
// shared utilities to stay consistent with how IDB stores them.
export { bytesToText, textToBytes }
