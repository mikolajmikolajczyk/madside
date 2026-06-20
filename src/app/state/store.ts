// Project store. IDB-backed, multi-project. Phase 2 adds list + switch + CRUD.

import { useCallback, useEffect, useRef, useState } from "react";
import { createFileSaver, type FileSaver } from "./file-saver";
import { exportProjectZip, importProjectZip } from "../project-zip";
import { MANIFEST_PATH } from "@adapters/storage-idb";
import { errorMessage, parseProjectManifest } from "@ports";
import type { EventBus, FileRow, ProjectManifestV2 as Manifest, ProjectRow, SnapshotMeta, StorageBackend } from "@ports";

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

/** The active project lives in the URL (`?project=<id>`) so it survives reload
 *  ("remember where I was") while a fresh visit with no param defaults to the
 *  welcome screen. Cleared on delete so we never auto-jump to another project. */
function readUrlProject(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("project") ?? undefined;
}
function writeUrlProject(id: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("project", id);
  else url.searchParams.delete("project");
  window.history.replaceState(null, "", url);
}

const dec = new TextDecoder();
const enc = new TextEncoder();

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useProject(storage: StorageBackend, events?: EventBus) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // False until the first resolution finishes — lets the UI tell "still
  // loading" apart from "resolved, but no project" (→ template picker).
  const [booted, setBooted] = useState(false);
  // Track previously-emitted projectId so reload() (file CRUD, rename, etc.)
  // does NOT re-emit `project:switched`. Only true switches do.
  const lastEmittedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Default view is the welcome screen. A project is opened only when the
        // URL carries `?project=<id>` (set on switch); no param → null → picker.
        const urlProjectId = readUrlProject();
        const loaded = urlProjectId ? await storage.projects.load(urlProjectId) : null;
        const list = await storage.projects.list();
        if (cancelled) return;
        if (!loaded) {
          // Empty store — no active project. App renders the template picker.
          setState(null);
          setProjects(list);
          setSnapshots([]);
          setBooted(true);
          return;
        }
        const bps = await storage.breakpoints.load(loaded.project.id);
        const snaps = await storage.snapshots.list(loaded.project.id);
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
        setBooted(true);
        if (events && lastEmittedProjectIdRef.current !== loaded.project.id) {
          lastEmittedProjectIdRef.current = loaded.project.id;
          events.emit('project:switched', { projectId: loaded.project.id });
        }
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e)); setBooted(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey, storage, events]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Re-read the project list from storage — for callers that mutate it outside
  // the active project (e.g. deleting another project from the welcome screen).
  const refreshProjects = useCallback(async () => {
    setProjects(await storage.projects.list());
  }, [storage]);

  // Debounced file persistence, behind a testable saver (see ./file-saver).
  // `storage` and `events` are the workbench's singletons (stable for the app's
  // lifetime), so the lazy useState init captures them directly — a single,
  // stable saver with no render-time ref write (#28).
  const [saver] = useState<FileSaver>(() => createFileSaver({
    write: (pid, path, content) => storage.projects.writeFile(pid, path, content),
    onSaved: (path) => events?.emit('file:changed', { path }),
    delayMs: SAVE_DEBOUNCE_MS,
  }));

  // Schedule dirty-file writes; the saver's returned cleanup cancels exactly
  // this run's timers, so a file removed inside the debounce window can't
  // resurrect its old bytes.
  useEffect(() => {
    if (!state) return;
    return saver.sync(state.projectId, state.files);
  }, [state, saver]);

  // Cancel everything + forget save history on project switch / unmount.
  useEffect(() => () => saver.reset(), [state?.projectId, saver]);

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
          // Validate through the real parser, not a bare `as Manifest` — keep
          // the previous manifest in live state while the edited JSON is invalid
          // (malformed, or a rejected v1 shape) so a half-typed edit can't push
          // a structurally-broken manifest into BuildService / plugin lookups.
          const parsed = parseProjectManifest(JSON.parse(dec.decode(bytes)));
          if (parsed.ok) next.manifest = parsed.value;
        } catch {
          // Invalid JSON — keep the previous manifest.
        }
      }
      return next;
    });
  }, []);

  const setActivePath = useCallback((path: string) => {
    setState((prev) => (prev ? { ...prev, activePath: path } : prev));
  }, []);

  const switchProject = useCallback(async (id: string) => {
    writeUrlProject(id); // remember where we are across reload
    await storage.kv.setActiveProjectId(id);
    reload();
  }, [reload, storage]);

  // Close the active project: drop the URL pointer and reload, so the boot
  // resolves to no project and the welcome hub shows. The project stays in
  // storage — reopen it from the welcome's project list.
  const closeProject = useCallback(async () => {
    writeUrlProject(null);
    reload();
  }, [reload]);

  // New-project creation moved to the bundled 'empty' template
  // (instantiateTemplate in @app/templates) — one source of truth for a blank
  // project. App's File → New project routes through it.

  const renameProjectAction = useCallback(async (newName: string): Promise<string | null> => {
    if (!state) return null;
    const finalName = await storage.projects.rename(state.projectId, newName);
    reload();
    return finalName;
  }, [state, reload, storage]);

  const duplicateProjectAction = useCallback(async (newName?: string): Promise<ProjectRow | null> => {
    if (!state) return null;
    const project = await storage.projects.duplicate(state.projectId, newName);
    writeUrlProject(project.id);
    await storage.kv.setActiveProjectId(project.id);
    reload();
    return project;
  }, [state, reload, storage]);

  const deleteProjectAction = useCallback(async (): Promise<void> => {
    if (!state) return;
    await storage.breakpoints.clear(state.projectId);
    await storage.snapshots.clearForProject(state.projectId);
    await storage.projects.delete(state.projectId);
    // Back to the welcome screen — never auto-jump to another project.
    writeUrlProject(null);
    reload();
  }, [state, reload, storage]);

  const exportProjectAction = useCallback(async (): Promise<Uint8Array | null> => {
    if (!state) return null;
    return exportProjectZip(storage, state.projectId);
  }, [state, storage]);

  const importProjectAction = useCallback(async (zipBytes: Uint8Array, fallbackName: string): Promise<ProjectRow> => {
    const project = await importProjectZip(storage, zipBytes, fallbackName);
    writeUrlProject(project.id);
    await storage.kv.setActiveProjectId(project.id);
    reload();
    return project;
  }, [reload, storage]);

  // === File CRUD ===

  const createFile = useCallback(async (path: string, content: string | Uint8Array = ""): Promise<void> => {
    if (!state) return;
    const bytes = typeof content === "string" ? enc.encode(content) : content;
    await storage.projects.createFile(state.projectId, path, bytes);
    reload();
  }, [state, reload, storage]);

  // Write new content to several existing files at once, then reload — the
  // multi-file apply path for an LSP rename / refactor (#75). Bypasses the
  // debounced active-file saver: edits can touch any project file, not just the
  // open one.
  const applyEdits = useCallback(async (edits: { path: string; content: Uint8Array }[]): Promise<void> => {
    if (!state || edits.length === 0) return;
    for (const e of edits) await storage.projects.writeFile(state.projectId, e.path, e.content);
    reload();
  }, [state, reload, storage]);

  // Empty folders aren't first-class — we drop a .gitkeep placeholder and
  // hide it from the tree. `prefix` should not include trailing slash.
  const createFolder = useCallback(async (prefix: string): Promise<void> => {
    if (!state) return;
    await storage.projects.createFile(state.projectId, `${prefix}/.gitkeep`, new Uint8Array());
    reload();
  }, [state, reload, storage]);

  const renameFile = useCallback(async (oldPath: string, newPath: string): Promise<void> => {
    if (!state) return;
    await storage.projects.renameFile(state.projectId, oldPath, newPath);
    // If renaming the main file, follow it in the manifest.
    if (state.manifest.main === oldPath) {
      const m = { ...state.manifest, main: newPath };
      await storage.projects.saveManifest(state.projectId, m);
    }
    reload();
  }, [state, reload, storage]);

  const renameFolder = useCallback(async (oldPrefix: string, newPrefix: string): Promise<void> => {
    if (!state) return;
    await storage.projects.renameFolder(state.projectId, oldPrefix, newPrefix);
    // Rewrite main if it lived under the old prefix.
    const oldP = oldPrefix.endsWith("/") ? oldPrefix : oldPrefix + "/";
    const newP = newPrefix.endsWith("/") ? newPrefix : newPrefix + "/";
    if (state.manifest.main.startsWith(oldP)) {
      const m = { ...state.manifest, main: newP + state.manifest.main.slice(oldP.length) };
      await storage.projects.saveManifest(state.projectId, m);
    }
    reload();
  }, [state, reload, storage]);

  const deleteFile = useCallback(async (path: string): Promise<void> => {
    if (!state) return;
    await storage.projects.deleteFile(state.projectId, path);
    reload();
  }, [state, reload, storage]);

  const deleteFolder = useCallback(async (prefix: string): Promise<void> => {
    if (!state) return;
    await storage.projects.deleteFolder(state.projectId, prefix);
    reload();
  }, [state, reload, storage]);

  const setMainFile = useCallback(async (path: string): Promise<void> => {
    if (!state) return;
    const m = { ...state.manifest, main: path };
    await storage.projects.saveManifest(state.projectId, m);
    reload();
  }, [state, reload, storage]);

  const updateManifest = useCallback(async (next: Manifest): Promise<void> => {
    if (!state) return;
    await storage.projects.saveManifest(state.projectId, next);
    reload();
  }, [state, reload, storage]);

  const duplicateFile = useCallback(async (path: string, newPath: string): Promise<void> => {
    if (!state) return;
    const src = state.files.find((f) => f.path === path);
    if (!src) return;
    await storage.projects.createFile(state.projectId, newPath, src.content);
    reload();
  }, [state, reload, storage]);

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
    const list = await storage.snapshots.list(pid);
    setSnapshots(list);
  }, [storage]);

  const createSnapshotNow = useCallback(async (summary = "manual"): Promise<SnapshotMeta | null> => {
    if (!state) return null;
    const snap = await storage.snapshots.create(state.projectId, summary, state.files);
    if (snap) await refreshSnapshots(state.projectId);
    return snap;
  }, [state, refreshSnapshots, storage]);

  const restoreSnapshotAction = useCallback(async (id: string): Promise<void> => {
    if (!state) return;
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    await storage.snapshots.restore(state.projectId, snap);
    reload();
  }, [state, snapshots, reload, storage]);

  const deleteSnapshotAction = useCallback(async (id: string): Promise<void> => {
    if (!state) return;
    await storage.snapshots.delete(id);
    await refreshSnapshots(state.projectId);
  }, [state, refreshSnapshots, storage]);

  // Auto-snapshot: 30s of no-edit → create a snapshot tagged "auto". Dedup
  // against the previous snapshot's tree means rapid no-op timer fires are cheap.
  const autoSnapTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state) return;
    if (autoSnapTimerRef.current != null) clearTimeout(autoSnapTimerRef.current);
    const pid = state.projectId;
    autoSnapTimerRef.current = window.setTimeout(() => {
      void storage.snapshots.create(pid, "auto", state.files).then((snap) => {
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
  }, [state, refreshSnapshots, storage]);

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
      void storage.breakpoints.save(pid, state.breakpoints).then(() => {
        bpSavedSnapshotRef.current = snap;
      });
      bpSaveTimerRef.current = null;
    }, 300);
  }, [state, storage]);
  useEffect(() => {
    return () => {
      if (bpSaveTimerRef.current != null) clearTimeout(bpSaveTimerRef.current);
      bpSavedSnapshotRef.current = "";
    };
  }, [state?.projectId]);

  // Surface asset-pipeline output: a build runs recipes that write generated/*
  // straight to storage (bypassing this store), so the file tree never saw them
  // until a reload. Pull them in after each build. Generated files are output —
  // never user-edited — so merging them can't clobber in-flight edits.
  const activeProjectId = state?.projectId;
  useEffect(() => {
    if (!events || !activeProjectId) return;
    return events.on('build:done', (p) => {
      if (p.projectId !== activeProjectId) return;
      void (async () => {
        const loaded = await storage.projects.load(p.projectId);
        const generated = loaded?.files.filter((f) => f.path.startsWith('generated/')) ?? [];
        if (generated.length === 0) return;
        setState((prev) => {
          if (!prev || prev.projectId !== p.projectId) return prev;
          const byPath = new Map(prev.files.map((f) => [f.path, f]));
          let changed = false;
          for (const g of generated) {
            const ex = byPath.get(g.path);
            if (!ex || !bytesEqual(ex.content, g.content)) {
              byPath.set(g.path, { path: g.path, content: g.content });
              changed = true;
            }
          }
          if (!changed) return prev;
          const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
          return { ...prev, files };
        });
      })();
    });
  }, [events, activeProjectId, storage]);

  if (!state) {
    // No active project. The picker uses `projects` (empty on first run) +
    // `switchProject` to open a freshly instantiated template. `booted`
    // distinguishes "still loading" from "resolved, nothing to open".
    return { loaded: false as const, error, booted, projects, switchProject, refreshProjects };
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
    refreshProjects,
    closeProject,
    renameProject: renameProjectAction,
    duplicateProject: duplicateProjectAction,
    deleteProject: deleteProjectAction,
    exportProject: exportProjectAction,
    importProject: importProjectAction,
    // file CRUD
    createFile,
    applyEdits,
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
