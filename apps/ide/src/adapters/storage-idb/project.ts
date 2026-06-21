// Project-level CRUD. UI layer talks to these, never to idb directly.

import { parseProjectManifest, StorageError } from "@ports";
import type { LoadedProject } from "@ports";
import { getDB } from "./db";
import { MANIFEST_PATH, isProjectRow, newProjectId, serializeManifest, uniquify } from "../storage-shared";
import type { Manifest, ProjectRow } from "./types";

const enc = new TextEncoder();
const dec = new TextDecoder();

// Shared persistence helpers live in @adapters/storage-shared (#19). Re-export
// MANIFEST_PATH for the many call sites that import it from this module.
export { MANIFEST_PATH };
const META_ACTIVE_PROJECT = "activeProjectId";

// Canonical shape lives in @ports/storage; re-export for continuity.
export type { LoadedProject };

export function textToBytes(s: string): Uint8Array { return enc.encode(s); }
export function bytesToText(b: Uint8Array): string { return dec.decode(b); }

export async function listProjects(): Promise<ProjectRow[]> {
  const db = await getDB();
  return db.getAll("projects");
}

export async function getActiveProjectId(): Promise<string | undefined> {
  const db = await getDB();
  const row = await db.get("meta", META_ACTIVE_PROJECT);
  return row?.value as string | undefined;
}

export async function setActiveProjectId(id: string): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key: META_ACTIVE_PROJECT, value: id });
}

export async function loadProject(id: string): Promise<LoadedProject | null> {
  const db = await getDB();
  const project = await db.get("projects", id);
  if (!project) return null;
  // Quarantine a structurally-corrupt row instead of flowing it into typed
  // state (ADR-0004): the manifest is validated below, but the row envelope
  // wasn't until now.
  if (!isProjectRow(project)) throw new StorageError(`corrupt project row: ${id}`);
  const files = await db.getAllFromIndex("files", "byProject", id);
  const manifestFile = files.find((f) => f.path === MANIFEST_PATH);
  if (!manifestFile) throw new StorageError(`project ${id} missing ${MANIFEST_PATH}`);
  const parsed = parseProjectManifest(JSON.parse(bytesToText(manifestFile.content)));
  if (!parsed.ok) throw parsed.error;
  return { project, manifest: parsed.value, files };
}

export async function saveFile(projectId: string, path: string, content: Uint8Array): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction(["files", "projects"], "readwrite");
  await tx.objectStore("files").put({ projectId, path, content, updatedAt: now });
  const project = await tx.objectStore("projects").get(projectId);
  if (project) {
    project.updatedAt = now;
    await tx.objectStore("projects").put(project);
  }
  await tx.done;
}

export async function deleteFile(projectId: string, path: string): Promise<void> {
  const db = await getDB();
  await db.delete("files", [projectId, path]);
}

export async function createProject(name: string, files: { path: string; content: Uint8Array }[], manifest: Manifest): Promise<ProjectRow> {
  const db = await getDB();
  const id = newProjectId(name);
  const now = Date.now();
  const project: ProjectRow = { id, name, createdAt: now, updatedAt: now };
  const tx = db.transaction(["projects", "files", "meta"], "readwrite");
  await tx.objectStore("projects").put(project);
  for (const f of files) {
    await tx.objectStore("files").put({ projectId: id, path: f.path, content: f.content, updatedAt: now });
  }
  // Ensure the manifest is in the file set so it's editable.
  if (!files.some((f) => f.path === MANIFEST_PATH)) {
    await tx.objectStore("files").put({
      projectId: id,
      path: MANIFEST_PATH,
      content: enc.encode(serializeManifest(manifest)),
      updatedAt: now,
    });
  }
  await tx.objectStore("meta").put({ key: META_ACTIVE_PROJECT, value: id });
  await tx.done;
  return project;
}

// Rename project + sync manifest.name. Disambiguates collisions with " (2)" suffixes.
export async function renameProject(id: string, requestedName: string): Promise<string> {
  const db = await getDB();
  const all = await db.getAll("projects");
  const taken = new Set(all.filter((p) => p.id !== id).map((p) => p.name));
  const name = uniquify(requestedName.trim() || "project", taken);

  const tx = db.transaction(["projects", "files"], "readwrite");
  const project = await tx.objectStore("projects").get(id);
  if (!project) { await tx.done; throw new StorageError(`project ${id} not found`); }
  project.name = name;
  project.updatedAt = Date.now();
  await tx.objectStore("projects").put(project);

  const manifestRow = await tx.objectStore("files").get([id, MANIFEST_PATH]);
  if (manifestRow) {
    try {
      const parsed = parseProjectManifest(JSON.parse(bytesToText(manifestRow.content)));
      if (parsed.ok) {
        const manifest: Manifest = { ...parsed.value, name };
        manifestRow.content = textToBytes(serializeManifest(manifest));
        manifestRow.updatedAt = Date.now();
        await tx.objectStore("files").put(manifestRow);
      }
      // Invalid manifest (v1 or malformed) — leave on disk; user sees mismatch.
    } catch {
      // JSON.parse failed — same handling.
    }
  }
  await tx.done;
  return name;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["projects", "files", "meta"], "readwrite");
  await tx.objectStore("projects").delete(id);
  // Cascade delete files via index.
  const files = await tx.objectStore("files").index("byProject").getAllKeys(id);
  for (const key of files) await tx.objectStore("files").delete(key);
  const meta = await tx.objectStore("meta").get(META_ACTIVE_PROJECT);
  if (meta && (meta.value as string) === id) await tx.objectStore("meta").delete(META_ACTIVE_PROJECT);
  await tx.done;
}

export async function duplicateProject(id: string, requestedName?: string): Promise<ProjectRow> {
  const loaded = await loadProject(id);
  if (!loaded) throw new StorageError(`project ${id} not found`);
  const all = await listProjects();
  const taken = new Set(all.map((p) => p.name));
  const baseName = requestedName?.trim() || `${loaded.project.name} (copy)`;
  const name = uniquify(baseName, taken);
  const manifest: Manifest = { ...loaded.manifest, name };
  const files = loaded.files
    .filter((f) => f.path !== MANIFEST_PATH)
    .map((f) => ({ path: f.path, content: f.content.slice() }));
  return createProject(name, files, manifest);
}

// === File CRUD (Phase 5) ===

/** Throws if a file already exists at path. */
export async function createFile(projectId: string, path: string, content: Uint8Array = new Uint8Array()): Promise<void> {
  const db = await getDB();
  const existing = await db.get("files", [projectId, path]);
  if (existing) throw new StorageError(`file exists: ${path}`);
  await saveFile(projectId, path, content);
}

/** Rename a single file. Throws if newPath already exists. */
export async function renameFile(projectId: string, oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return;
  const db = await getDB();
  const tx = db.transaction(["files", "projects"], "readwrite");
  const files = tx.objectStore("files");
  const target = await files.get([projectId, newPath]);
  if (target) { await tx.done; throw new StorageError(`destination exists: ${newPath}`); }
  const src = await files.get([projectId, oldPath]);
  if (!src) { await tx.done; throw new StorageError(`source missing: ${oldPath}`); }
  await files.delete([projectId, oldPath]);
  await files.put({ projectId, path: newPath, content: src.content, updatedAt: Date.now() });
  const project = await tx.objectStore("projects").get(projectId);
  if (project) { project.updatedAt = Date.now(); await tx.objectStore("projects").put(project); }
  await tx.done;
}

/** Rename a folder = bulk rewrite paths sharing the old prefix. */
export async function renameFolder(projectId: string, oldPrefix: string, newPrefix: string): Promise<void> {
  if (oldPrefix === newPrefix) return;
  const oldP = oldPrefix.endsWith("/") ? oldPrefix : oldPrefix + "/";
  const newP = newPrefix.endsWith("/") ? newPrefix : newPrefix + "/";
  const db = await getDB();
  const tx = db.transaction(["files", "projects"], "readwrite");
  const files = tx.objectStore("files");
  const all = await files.index("byProject").getAll(projectId);
  // Collision check
  for (const f of all) {
    if (f.path.startsWith(oldP)) {
      const candidate = newP + f.path.slice(oldP.length);
      if (all.some((x) => x.path === candidate && !x.path.startsWith(oldP))) {
        await tx.done;
        throw new StorageError(`destination collision: ${candidate}`);
      }
    }
  }
  const now = Date.now();
  for (const f of all) {
    if (!f.path.startsWith(oldP)) continue;
    const newPath = newP + f.path.slice(oldP.length);
    await files.delete([projectId, f.path]);
    await files.put({ projectId, path: newPath, content: f.content, updatedAt: now });
  }
  const project = await tx.objectStore("projects").get(projectId);
  if (project) { project.updatedAt = now; await tx.objectStore("projects").put(project); }
  await tx.done;
}

/** Delete every file under a folder prefix (inclusive). */
export async function deleteFolder(projectId: string, prefix: string): Promise<void> {
  const p = prefix.endsWith("/") ? prefix : prefix + "/";
  const db = await getDB();
  const tx = db.transaction(["files", "projects"], "readwrite");
  const files = tx.objectStore("files");
  const all = await files.index("byProject").getAllKeys(projectId);
  for (const key of all) {
    const path = (key as [string, string])[1];
    if (path.startsWith(p)) await files.delete(key);
  }
  const project = await tx.objectStore("projects").get(projectId);
  if (project) { project.updatedAt = Date.now(); await tx.objectStore("projects").put(project); }
  await tx.done;
}

/** Update the manifest file in storage. Manifest is just `project.json`. */
export async function saveManifest(projectId: string, manifest: Manifest): Promise<void> {
  await saveFile(projectId, MANIFEST_PATH, textToBytes(serializeManifest(manifest)));
}
