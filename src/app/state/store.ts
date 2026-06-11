// Project store. IDB-backed, multi-project. Phase 2 adds list + switch + CRUD.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFile as createFileIDB,
  createProject,
  deleteFile as deleteFileIDB,
  deleteFolder as deleteFolderIDB,
  deleteProject,
  duplicateProject,
  listProjects,
  MANIFEST_PATH,
  renameFile as renameFileIDB,
  renameFolder as renameFolderIDB,
  renameProject,
  saveFile,
  saveManifest,
  setActiveProjectId,
  textToBytes,
} from "@adapters/storage-idb";
import { ensureActiveProject } from "@adapters/storage-idb";
import { exportProjectToZip, importProjectFromZip } from "@adapters/storage-idb";
import { clearBreakpoints, loadBreakpoints, saveBreakpoints } from "@adapters/storage-idb";
import {
  clearSnapshotsForProject,
  createSnapshot,
  deleteSnapshot as deleteSnapshotIDB,
  listSnapshots,
  restoreSnapshot as restoreSnapshotIDB,
  type SnapshotMeta,
} from "@adapters/storage-idb";
import type { FileRow, Manifest, ProjectRow } from "@adapters/storage-idb";
import { MANIFEST_VERSION } from "@ports";

// Files are stored as bytes end-to-end. Text views (Editor, MADS source list,
// label scanner, etc.) decode lazily; binary views (AssetPanel, custom Phase 11
// editors) consume the bytes directly.
export interface FileEntry {
  path: string;
  content: Uint8Array;
}

export interface ProjectState {
  projectId: string;
  manifest: Manifest;
  files: FileEntry[];
  activePath: string;
  breakpoints: Map<string, Set<number>>;
}

const SAVE_DEBOUNCE_MS = 500;
const SEED_NEW_MAIN_PATH = "src/main.asm";
const SEED_NEW_MAIN_CONTENT = `; new project
        org $2000
start
        rts
        run start
`;

const dec = new TextDecoder();
const enc = new TextEncoder();
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useProject() {
  const [state, setState] = useState<ProjectState | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const urlProjectId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("project") ?? undefined
            : undefined;
        const loaded = await ensureActiveProject(urlProjectId);
        const list = await listProjects();
        const bps = await loadBreakpoints(loaded.project.id);
        const snaps = await listSnapshots(loaded.project.id);
        if (cancelled) return;
        const files: FileEntry[] = loaded.files.map((f: FileRow) => ({
          path: f.path,
          content: f.content,
        }));
        files.sort((a, b) => a.path.localeCompare(b.path));
        const activePath = preferredActivePath(files, loaded.manifest);
        setState({
          projectId: loaded.project.id,
          manifest: loaded.manifest,
          files,
          activePath,
          breakpoints: bps,
        });
        setProjects(list);
        setSnapshots(snaps);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Debounced file persistence keyed on (projectId, path). Pending timers are
  // cleared when projectId changes so a stale write doesn't land on the new project.
  const lastSavedRef = useRef<Map<string, Uint8Array>>(new Map());
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!state) return;
    const pid = state.projectId;
    for (const f of state.files) {
      const key = `${pid}::${f.path}`;
      const prev = lastSavedRef.current.get(key);
      if (prev && bytesEqual(prev, f.content)) continue;
      const existingTimer = timersRef.current.get(key);
      if (existingTimer != null) clearTimeout(existingTimer);
      const handle = window.setTimeout(() => {
        const current = state.files.find((x) => x.path === f.path);
        if (!current) return;
        void saveFile(pid, f.path, current.content).then(() => {
          lastSavedRef.current.set(key, current.content);
        });
        timersRef.current.delete(key);
      }, SAVE_DEBOUNCE_MS);
      timersRef.current.set(key, handle);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      for (const h of timersRef.current.values()) clearTimeout(h);
      timersRef.current.clear();
      lastSavedRef.current.clear();
    };
  }, [state?.projectId]);

  const updateActive = useCallback((content: string | Uint8Array) => {
    const bytes = typeof content === "string" ? enc.encode(content) : content;
    setState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        files: prev.files.map((f) => (f.path === prev.activePath ? { ...f, content: bytes } : f)),
      };
      if (prev.activePath === MANIFEST_PATH) {
        try {
          next.manifest = JSON.parse(dec.decode(bytes)) as Manifest;
        } catch {
          // Leave previous manifest while JSON is invalid.
        }
      }
      return next;
    });
  }, []);

  const setActivePath = useCallback((path: string) => {
    setState((prev) => (prev ? { ...prev, activePath: path } : prev));
  }, []);

  const switchProject = useCallback(async (id: string) => {
    await setActiveProjectId(id);
    reload();
  }, [reload]);

  const newProject = useCallback(async (name: string): Promise<ProjectRow> => {
    const trimmed = name.trim() || "project";
    const manifest: Manifest = {
      version: MANIFEST_VERSION,
      name: trimmed,
      main: SEED_NEW_MAIN_PATH,
      machine: "atari-xl",
      toolchain: "mads",
      run: { default: { audio: true } },
    };
    const project = await createProject(
      trimmed,
      [{ path: SEED_NEW_MAIN_PATH, content: textToBytes(SEED_NEW_MAIN_CONTENT) }],
      manifest,
    );
    await setActiveProjectId(project.id);
    reload();
    return project;
  }, [reload]);

  const renameProjectAction = useCallback(async (newName: string): Promise<string | null> => {
    if (!state) return null;
    const finalName = await renameProject(state.projectId, newName);
    reload();
    return finalName;
  }, [state, reload]);

  const duplicateProjectAction = useCallback(async (newName?: string): Promise<ProjectRow | null> => {
    if (!state) return null;
    const project = await duplicateProject(state.projectId, newName);
    await setActiveProjectId(project.id);
    reload();
    return project;
  }, [state, reload]);

  const deleteProjectAction = useCallback(async (): Promise<void> => {
    if (!state) return;
    await clearBreakpoints(state.projectId);
    await clearSnapshotsForProject(state.projectId);
    await deleteProject(state.projectId);
    // ensureActiveProject() will reseed a sandbox if the last one was removed.
    reload();
  }, [state, reload]);

  const exportProjectAction = useCallback(async (): Promise<Uint8Array | null> => {
    if (!state) return null;
    return exportProjectToZip(state.projectId);
  }, [state]);

  const importProjectAction = useCallback(async (zipBytes: Uint8Array, fallbackName: string): Promise<ProjectRow> => {
    const project = await importProjectFromZip(zipBytes, fallbackName);
    await setActiveProjectId(project.id);
    reload();
    return project;
  }, [reload]);

  // === File CRUD ===

  const createFile = useCallback(async (path: string, content: string | Uint8Array = ""): Promise<void> => {
    if (!state) return;
    const bytes = typeof content === "string" ? enc.encode(content) : content;
    await createFileIDB(state.projectId, path, bytes);
    reload();
  }, [state, reload]);

  // Empty folders aren't first-class — we drop a .gitkeep placeholder and
  // hide it from the tree. `prefix` should not include trailing slash.
  const createFolder = useCallback(async (prefix: string): Promise<void> => {
    if (!state) return;
    await createFileIDB(state.projectId, `${prefix}/.gitkeep`, new Uint8Array());
    reload();
  }, [state, reload]);

  const renameFile = useCallback(async (oldPath: string, newPath: string): Promise<void> => {
    if (!state) return;
    await renameFileIDB(state.projectId, oldPath, newPath);
    // If renaming the main file, follow it in the manifest.
    if (state.manifest.main === oldPath) {
      const m = { ...state.manifest, main: newPath };
      await saveManifest(state.projectId, m);
    }
    reload();
  }, [state, reload]);

  const renameFolder = useCallback(async (oldPrefix: string, newPrefix: string): Promise<void> => {
    if (!state) return;
    await renameFolderIDB(state.projectId, oldPrefix, newPrefix);
    // Rewrite main if it lived under the old prefix.
    const oldP = oldPrefix.endsWith("/") ? oldPrefix : oldPrefix + "/";
    const newP = newPrefix.endsWith("/") ? newPrefix : newPrefix + "/";
    if (state.manifest.main.startsWith(oldP)) {
      const m = { ...state.manifest, main: newP + state.manifest.main.slice(oldP.length) };
      await saveManifest(state.projectId, m);
    }
    reload();
  }, [state, reload]);

  const deleteFile = useCallback(async (path: string): Promise<void> => {
    if (!state) return;
    await deleteFileIDB(state.projectId, path);
    reload();
  }, [state, reload]);

  const deleteFolder = useCallback(async (prefix: string): Promise<void> => {
    if (!state) return;
    await deleteFolderIDB(state.projectId, prefix);
    reload();
  }, [state, reload]);

  const setMainFile = useCallback(async (path: string): Promise<void> => {
    if (!state) return;
    const m = { ...state.manifest, main: path };
    await saveManifest(state.projectId, m);
    reload();
  }, [state, reload]);

  const updateManifest = useCallback(async (next: Manifest): Promise<void> => {
    if (!state) return;
    await saveManifest(state.projectId, next);
    reload();
  }, [state, reload]);

  const duplicateFile = useCallback(async (path: string, newPath: string): Promise<void> => {
    if (!state) return;
    const src = state.files.find((f) => f.path === path);
    if (!src) return;
    await createFileIDB(state.projectId, newPath, src.content);
    reload();
  }, [state, reload]);

  // === Breakpoints ===

  const toggleBreakpoint = useCallback((path: string, line: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.breakpoints);
      const cur = new Set(next.get(path) ?? []);
      if (cur.has(line)) cur.delete(line); else cur.add(line);
      if (cur.size === 0) next.delete(path);
      else next.set(path, cur);
      return { ...prev, breakpoints: next };
    });
  }, []);

  const clearAllBreakpoints = useCallback(() => {
    setState((prev) => (prev ? { ...prev, breakpoints: new Map() } : prev));
  }, []);

  // === Snapshots ===

  const refreshSnapshots = useCallback(async (pid: string) => {
    const list = await listSnapshots(pid);
    setSnapshots(list);
  }, []);

  const createSnapshotNow = useCallback(async (summary = "manual"): Promise<SnapshotMeta | null> => {
    if (!state) return null;
    const snap = await createSnapshot(state.projectId, summary, state.files);
    if (snap) await refreshSnapshots(state.projectId);
    return snap;
  }, [state, refreshSnapshots]);

  const restoreSnapshotAction = useCallback(async (id: string): Promise<void> => {
    if (!state) return;
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    await restoreSnapshotIDB(state.projectId, snap);
    reload();
  }, [state, snapshots, reload]);

  const deleteSnapshotAction = useCallback(async (id: string): Promise<void> => {
    if (!state) return;
    await deleteSnapshotIDB(id);
    await refreshSnapshots(state.projectId);
  }, [state, refreshSnapshots]);

  // Auto-snapshot: 30s of no-edit → create a snapshot tagged "auto". Dedup
  // against the previous snapshot's tree means rapid no-op timer fires are cheap.
  const autoSnapTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    if (autoSnapTimerRef.current != null) clearTimeout(autoSnapTimerRef.current);
    const pid = state.projectId;
    autoSnapTimerRef.current = window.setTimeout(() => {
      void createSnapshot(pid, "auto", state.files).then((snap) => {
        if (snap) void refreshSnapshots(pid);
      });
      autoSnapTimerRef.current = null;
    }, 30_000);
    return () => {
      if (autoSnapTimerRef.current != null) {
        clearTimeout(autoSnapTimerRef.current);
        autoSnapTimerRef.current = null;
      }
    };
  }, [state, refreshSnapshots]);

  // Debounced BP persistence — write to IDB ~300ms after last toggle. Cleared
  // on projectId change so a quick switch never lands stale state.
  const bpSaveTimerRef = useRef<number | null>(null);
  const bpSavedSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!state) return;
    const pid = state.projectId;
    const snap = serializeBps(state.breakpoints);
    if (snap === bpSavedSnapshotRef.current) return;
    if (bpSaveTimerRef.current != null) clearTimeout(bpSaveTimerRef.current);
    bpSaveTimerRef.current = window.setTimeout(() => {
      void saveBreakpoints(pid, state.breakpoints).then(() => {
        bpSavedSnapshotRef.current = snap;
      });
      bpSaveTimerRef.current = null;
    }, 300);
  }, [state]);
  useEffect(() => {
    return () => {
      if (bpSaveTimerRef.current != null) clearTimeout(bpSaveTimerRef.current);
      bpSavedSnapshotRef.current = "";
    };
  }, [state?.projectId]);

  if (!state) {
    return { loaded: false as const, error };
  }

  const active = state.files.find((f) => f.path === state.activePath) ?? state.files[0];
  return {
    loaded: true as const,
    error: null,
    projectId: state.projectId,
    manifest: state.manifest,
    files: state.files,
    active,
    activePath: state.activePath,
    setActivePath,
    updateActive,
    projects,
    switchProject,
    newProject,
    renameProject: renameProjectAction,
    duplicateProject: duplicateProjectAction,
    deleteProject: deleteProjectAction,
    exportProject: exportProjectAction,
    importProject: importProjectAction,
    // file CRUD
    createFile,
    createFolder,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    setMainFile,
    updateManifest,
    duplicateFile,
    // breakpoints
    breakpoints: state.breakpoints,
    toggleBreakpoint,
    clearAllBreakpoints,
    // snapshots
    snapshots,
    createSnapshotNow,
    restoreSnapshot: restoreSnapshotAction,
    deleteSnapshot: deleteSnapshotAction,
  };
}

function serializeBps(map: Map<string, Set<number>>): string {
  const obj: Record<string, number[]> = {};
  for (const [k, v] of map) obj[k] = Array.from(v).sort((a, b) => a - b);
  return JSON.stringify(obj);
}

function preferredActivePath(files: FileEntry[], manifest: Manifest): string {
  if (files.some((f) => f.path === manifest.main)) return manifest.main;
  const code = files.find((f) => /\.(a65|asm|inc)$/i.test(f.path) && f.path !== MANIFEST_PATH);
  return (code ?? files[0]).path;
}
