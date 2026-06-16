// In-memory StorageBackend — backs the headless workbench and tests, and is the
// reference the contract harness runs alongside the IDB adapter (ADR-0005).
// Mirrors the IDB adapter's semantics: same id generation, manifest-file
// injection, content-addressable snapshots, and prune/gc behaviour.

import { parseProjectManifest, StorageError } from "@ports";
import type {
  FileRow,
  InstalledCourseRow,
  LoadedProject,
  ProjectFileInput,
  ProjectManifestV2,
  ProjectRow,
  SnapshotInput,
  SnapshotMeta,
  StorageBackend,
} from "@ports";
import { sha256Hex } from "@core/hash";
import {
  AUTO_KEEP,
  MANIFEST_PATH,
  diffSnapshots,
  newProjectId,
  newSnapshotId,
  sameTree,
  serializeManifest,
  uniquify,
} from "../storage-shared";

const enc = new TextEncoder();
const dec = new TextDecoder();

const fileKey = (projectId: string, path: string) => `${projectId} ${path}`;

export function createMemoryStorage(): StorageBackend {
  const projects = new Map<string, ProjectRow>();
  const files = new Map<string, FileRow>(); // key: fileKey(projectId, path)
  const snapshots = new Map<string, SnapshotMeta>();
  const blobs = new Map<string, Uint8Array>();
  const courses = new Map<string, InstalledCourseRow>();
  const bpStore = new Map<string, Record<string, number[]>>(); // projectId → record
  const meta: { activeProjectId?: string } = {};

  const filesOf = (projectId: string): FileRow[] =>
    [...files.values()].filter((f) => f.projectId === projectId);

  const touch = (projectId: string, now: number) => {
    const p = projects.get(projectId);
    if (p) p.updatedAt = now;
  };

  const putFile = (projectId: string, path: string, content: Uint8Array, now: number) => {
    files.set(fileKey(projectId, path), { projectId, path, content: content.slice(), updatedAt: now });
  };

  function gcOrphanBlobs(): number {
    const refs = new Set<string>();
    for (const s of snapshots.values()) for (const h of Object.values(s.tree)) refs.add(h);
    let removed = 0;
    for (const hash of [...blobs.keys()]) {
      if (!refs.has(hash)) { blobs.delete(hash); removed++; }
    }
    return removed;
  }

  async function pruneAuto(projectId: string, keep: number): Promise<number> {
    const autos = [...snapshots.values()]
      .filter((s) => s.projectId === projectId && s.summary !== "manual")
      .sort((a, b) => b.ts - a.ts);
    if (autos.length <= keep) return 0;
    for (const s of autos.slice(keep)) snapshots.delete(s.id);
    gcOrphanBlobs();
    return autos.length - keep;
  }

  return {
    projects: {
      async list() {
        return [...projects.values()].map((p) => ({ ...p }));
      },
      async load(id): Promise<LoadedProject | null> {
        const project = projects.get(id);
        if (!project) return null;
        const fs = filesOf(id);
        const manifestFile = fs.find((f) => f.path === MANIFEST_PATH);
        if (!manifestFile) throw new StorageError(`project ${id} missing ${MANIFEST_PATH}`);
        const parsed = parseProjectManifest(JSON.parse(dec.decode(manifestFile.content)));
        if (!parsed.ok) throw parsed.error;
        return { project: { ...project }, manifest: parsed.value, files: fs };
      },
      async create(name, input: ProjectFileInput[], manifest: ProjectManifestV2): Promise<ProjectRow> {
        const id = newProjectId(name);
        const now = Date.now();
        const project: ProjectRow = { id, name, createdAt: now, updatedAt: now };
        projects.set(id, project);
        for (const f of input) putFile(id, f.path, f.content, now);
        if (!input.some((f) => f.path === MANIFEST_PATH)) {
          putFile(id, MANIFEST_PATH, enc.encode(serializeManifest(manifest)), now);
        }
        meta.activeProjectId = id;
        return { ...project };
      },
      async rename(id, requestedName): Promise<string> {
        const project = projects.get(id);
        if (!project) throw new StorageError(`project ${id} not found`);
        const taken = new Set([...projects.values()].filter((p) => p.id !== id).map((p) => p.name));
        const name = uniquify(requestedName.trim() || "project", taken);
        const now = Date.now();
        project.name = name;
        project.updatedAt = now;
        const manifestRow = files.get(fileKey(id, MANIFEST_PATH));
        if (manifestRow) {
          try {
            const parsed = parseProjectManifest(JSON.parse(dec.decode(manifestRow.content)));
            if (parsed.ok) {
              const m: ProjectManifestV2 = { ...parsed.value, name };
              putFile(id, MANIFEST_PATH, enc.encode(serializeManifest(m)), now);
            }
          } catch {
            // invalid/malformed manifest — leave on disk, same as IDB.
          }
        }
        return name;
      },
      async duplicate(id, requestedName): Promise<ProjectRow> {
        const project = projects.get(id);
        if (!project) throw new StorageError(`project ${id} not found`);
        const fs = filesOf(id);
        const manifestFile = fs.find((f) => f.path === MANIFEST_PATH);
        if (!manifestFile) throw new StorageError(`project ${id} missing ${MANIFEST_PATH}`);
        const parsed = parseProjectManifest(JSON.parse(dec.decode(manifestFile.content)));
        if (!parsed.ok) throw parsed.error;
        const taken = new Set([...projects.values()].map((p) => p.name));
        const name = uniquify(requestedName?.trim() || `${project.name} (copy)`, taken);
        const manifest: ProjectManifestV2 = { ...parsed.value, name };
        const copyFiles = fs
          .filter((f) => f.path !== MANIFEST_PATH)
          .map((f) => ({ path: f.path, content: f.content.slice() }));
        return this.create(name, copyFiles, manifest);
      },
      async delete(id) {
        projects.delete(id);
        for (const f of filesOf(id)) files.delete(fileKey(id, f.path));
        if (meta.activeProjectId === id) delete meta.activeProjectId;
      },
      async writeFile(projectId, path, content) {
        const now = Date.now();
        putFile(projectId, path, content, now);
        touch(projectId, now);
      },
      async createFile(projectId, path, content = new Uint8Array()) {
        if (files.has(fileKey(projectId, path))) throw new StorageError(`file exists: ${path}`);
        await this.writeFile(projectId, path, content);
      },
      async deleteFile(projectId, path) {
        files.delete(fileKey(projectId, path));
      },
      async renameFile(projectId, oldPath, newPath) {
        if (oldPath === newPath) return;
        if (files.has(fileKey(projectId, newPath))) throw new StorageError(`destination exists: ${newPath}`);
        const src = files.get(fileKey(projectId, oldPath));
        if (!src) throw new StorageError(`source missing: ${oldPath}`);
        const now = Date.now();
        files.delete(fileKey(projectId, oldPath));
        putFile(projectId, newPath, src.content, now);
        touch(projectId, now);
      },
      async renameFolder(projectId, oldPrefix, newPrefix) {
        if (oldPrefix === newPrefix) return;
        const oldP = oldPrefix.endsWith("/") ? oldPrefix : oldPrefix + "/";
        const newP = newPrefix.endsWith("/") ? newPrefix : newPrefix + "/";
        const all = filesOf(projectId);
        for (const f of all) {
          if (f.path.startsWith(oldP)) {
            const candidate = newP + f.path.slice(oldP.length);
            if (all.some((x) => x.path === candidate && !x.path.startsWith(oldP))) {
              throw new StorageError(`destination collision: ${candidate}`);
            }
          }
        }
        const now = Date.now();
        for (const f of all) {
          if (!f.path.startsWith(oldP)) continue;
          const newPath = newP + f.path.slice(oldP.length);
          files.delete(fileKey(projectId, f.path));
          putFile(projectId, newPath, f.content, now);
        }
        touch(projectId, now);
      },
      async deleteFolder(projectId, prefix) {
        const p = prefix.endsWith("/") ? prefix : prefix + "/";
        const now = Date.now();
        for (const f of filesOf(projectId)) {
          if (f.path.startsWith(p)) files.delete(fileKey(projectId, f.path));
        }
        touch(projectId, now);
      },
      async saveManifest(projectId, manifest) {
        await this.writeFile(projectId, MANIFEST_PATH, enc.encode(serializeManifest(manifest)));
      },
    },

    snapshots: {
      async create(projectId, summary, input: SnapshotInput[]): Promise<SnapshotMeta | null> {
        const tree: Record<string, string> = {};
        const pending: { hash: string; data: Uint8Array }[] = [];
        for (const f of input) {
          const hash = await sha256Hex(f.content);
          tree[f.path] = hash;
          if (!blobs.has(hash)) pending.push({ hash, data: f.content.slice() });
        }
        const recent = [...snapshots.values()]
          .filter((s) => s.projectId === projectId)
          .sort((a, b) => b.ts - a.ts);
        if (recent.length > 0 && sameTree(recent[0].tree, tree)) return null;
        const ts = Date.now();
        const id = newSnapshotId(projectId, ts);
        const snapshot: SnapshotMeta = { id, projectId, ts, summary, tree };
        for (const b of pending) blobs.set(b.hash, b.data);
        snapshots.set(id, snapshot);
        await pruneAuto(projectId, AUTO_KEEP);
        return { ...snapshot, tree: { ...tree } };
      },
      async list(projectId) {
        return [...snapshots.values()]
          .filter((s) => s.projectId === projectId)
          .sort((a, b) => b.ts - a.ts)
          .map((s) => ({ ...s, tree: { ...s.tree } }));
      },
      async restore(projectId, snapshot) {
        const next = new Map<string, Uint8Array>();
        for (const [path, hash] of Object.entries(snapshot.tree)) {
          const data = blobs.get(hash);
          if (data) next.set(path, data);
        }
        for (const f of filesOf(projectId)) files.delete(fileKey(projectId, f.path));
        const now = Date.now();
        for (const [path, bytes] of next) putFile(projectId, path, bytes, now);
        touch(projectId, now);
      },
      async delete(id) {
        snapshots.delete(id);
        gcOrphanBlobs();
      },
      async clearForProject(projectId) {
        for (const s of [...snapshots.values()]) {
          if (s.projectId === projectId) snapshots.delete(s.id);
        }
        gcOrphanBlobs();
      },
      pruneAuto,
      async gcOrphanBlobs() {
        return gcOrphanBlobs();
      },
      diff: diffSnapshots,
    },

    breakpoints: {
      load(projectId) {
        const row = bpStore.get(projectId);
        return Promise.resolve(row ? recordToMap(row) : new Map());
      },
      save(projectId, bps) {
        const rec: Record<string, number[]> = {};
        for (const [path, lines] of bps) {
          if (lines.size === 0) continue;
          rec[path] = [...lines].sort((a, b) => a - b);
        }
        bpStore.set(projectId, rec);
        return Promise.resolve();
      },
      clear(projectId) {
        bpStore.delete(projectId);
        return Promise.resolve();
      },
    },

    courses: {
      install(row) { courses.set(row.sourceId, row); return Promise.resolve(); },
      list() { return Promise.resolve([...courses.values()]); },
      get(sourceId) { return Promise.resolve(courses.get(sourceId)); },
      remove(sourceId) { courses.delete(sourceId); return Promise.resolve(); },
    },

    kv: {
      getActiveProjectId() { return Promise.resolve(meta.activeProjectId); },
      setActiveProjectId(id) { meta.activeProjectId = id; return Promise.resolve(); },
    },
  };
}

function recordToMap(rec: Record<string, number[]>): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const [path, lines] of Object.entries(rec)) {
    if (lines.length > 0) out.set(path, new Set(lines));
  }
  return out;
}
