# Research — generalizing the storage layer

Status: research / proposal. Question: is storage generalized, and what interfaces do we need to swap the backend (remote sync, OPFS/FSA, sqlite-wasm, …)?

## Verdict

**Storage is only *partially* generalized, and the abstraction that exists is dead.** There is a clean `ProjectRepository` port (in `@ports`, with IDB + in-memory impls), but:

1. **It's unused.** `workbench.projects` is wired in `createWorkbench` but **nothing ever calls it** (`grep` for `.projects.{list,load,save,…}` → zero call sites outside the memory adapter's own internals).
2. **It's incomplete.** It covers projects + snapshots only — not file CRUD, breakpoints, installed courses, the active-project pointer, or ZIP I/O.
3. **It's bypassed.** The real data layer — `src/app/state/store.ts` — and `templates.ts` / `courses.ts` / `course-project.ts` / `course-fetch.ts` bind **directly to the IDB adapter's raw functions** (`loadProject`, `saveFile`, `createProject`, `deleteProject`, `loadBreakpoints`, `listSnapshots`, `restoreSnapshot`, `setActiveProjectId`, `installRemoteCourse`, `exportProjectToZip`, … — ~20 of them in `store.ts` alone).

The IDB adapter exposes **42 exported functions**; the port abstracts ~8 of them. So swapping IndexedDB for another backend today means rewriting ~9 files and reimplementing ~34 un-abstracted functions. **Not generalized in any useful sense.**

## Current state (concrete)

| Layer | Reality |
|-------|---------|
| Port | `@ports/project-repository.ts` — `ProjectRepository` (Result-typed): `listProjects / loadProject / saveProject / deleteProject / snapshot / listSnapshots / restoreSnapshot / deleteSnapshot`. Plus `Project / ProjectMeta / ProjectFile / Snapshot / SnapshotMeta` types. Comment even anticipates an "FSA adapter (Phase 10)". |
| Adapters | `@adapters/storage-idb` (42 fns) implements `createIdbProjectRepository` **and** exports all the raw functions everyone actually uses. `@adapters/storage-memory` implements the port (full, incl. snapshots) — test fixture only. |
| Consumers | `store.ts` (the data layer), `templates.ts`, `courses.ts`, `course-project.ts`, `course-fetch.ts` → raw IDB fns. `createWorkbench` → the (unused) port. |
| Boundary | ADR-0002 allows `app → adapters` (so the store's raw imports are *legal*). It does **not** allow `ui → adapters` — yet `HistoryDialog` imports `diffSnapshots`/`SnapshotMeta`, `AssetPanel` imports `type Manifest`, `MenuBar` imports `type ProjectRow`, each behind an `eslint-disable boundaries/element-types` + `// TODO: service extraction`. Known smell. |
| Error convention | **Inconsistent**: the port returns `Result<T, StorageError>`; the raw IDB fns **throw**. The store is written against throwing fns (try/catch in boot). |

## Why generalize (the payoff)

- **Alternative backends.** The obvious ones: a **remote/server store** (cross-device sync, accounts, sharing projects) — increasingly relevant now that the app is public; **OPFS / File System Access** (real files on disk, the port already names this "Phase 10"); **sqlite-wasm / OPFS-backed** for bigger/queryable stores.
- **Testability.** A complete port means the headless workbench + UI logic test against the memory adapter without `fake-indexeddb`.
- **Honest layering.** Kills the `ui → adapters` leaks and the "store knows IDB" coupling.

## Gaps — what is NOT behind any interface today

Everything the store/app needs beyond projects+snapshots:

- **File CRUD within a project:** `saveFile`, `createFile`, `deleteFile`, `renameFile`, `renameFolder`, `deleteFolder`, `saveManifest`.
- **Breakpoints:** `loadBreakpoints`, `saveBreakpoints`, `clearBreakpoints` (+ `bpsToRecord`/`recordToBps`).
- **Installed remote courses:** `installRemoteCourse`, `listInstalledCourses`, `getInstalledCourse`, `removeInstalledCourse`.
- **Active-project pointer + flags (key/value meta):** `getActiveProjectId`, `setActiveProjectId`, seed flags.
- **Snapshot internals beyond the port:** `createSnapshot`, `clearSnapshotsForProject`, `pruneAutoSnapshots`, `diffSnapshots`, `gcOrphanBlobs` (content-addressable blob store).
- **ZIP import/export:** `exportProjectToZip`, `importProjectFromZip` (a *serialization* concern layered on top of load/create — see below).
- **Helpers leaking as API:** `textToBytes`, `bytesToText`, `MANIFEST_PATH`.

## Proposed interfaces

Define a **complete `StorageBackend`** in `@ports`, composed of cohesive sub-stores. IndexedDB becomes one implementation; memory another; remote/OPFS later. Sketch:

```ts
// @ports/storage  (bytes in/out; manifest parsing stays where it is)
interface ProjectStore {
  list(): Promise<ProjectMeta[]>
  load(id: string): Promise<Project | null>
  create(name: string, files: ProjectFile[], manifest: ProjectManifestV2): Promise<ProjectMeta>
  rename(id: string, name: string): Promise<string>
  duplicate(id: string, name?: string): Promise<ProjectMeta>
  delete(id: string): Promise<void>
  // files are scoped to a project
  writeFile(projectId: string, path: string, bytes: Uint8Array): Promise<void>
  deleteFile(projectId: string, path: string): Promise<void>
  renameFile(projectId: string, from: string, to: string): Promise<void>
  renameFolder(projectId: string, from: string, to: string): Promise<void>
  deleteFolder(projectId: string, prefix: string): Promise<void>
  saveManifest(projectId: string, manifest: ProjectManifestV2): Promise<void>
}

interface SnapshotStore {
  create(projectId: string, summary?: string): Promise<SnapshotMeta>
  list(projectId: string): Promise<SnapshotMeta[]>
  restore(snapshotId: string): Promise<void>
  delete(snapshotId: string): Promise<void>
  diff(a: string, b: string): Promise<SnapshotDiff>
  prune(projectId: string): Promise<void>        // auto-snapshot retention
  clearForProject(projectId: string): Promise<void>
}

interface BreakpointStore {
  load(projectId: string): Promise<Map<string, Set<number>>>
  save(projectId: string, bps: Map<string, Set<number>>): Promise<void>
  clear(projectId: string): Promise<void>
}

interface CourseStore {                            // installed remote courses
  install(row: InstalledCourse): Promise<void>
  list(): Promise<InstalledCourse[]>
  get(sourceId: string): Promise<InstalledCourse | undefined>
  remove(sourceId: string): Promise<void>
}

interface KeyValueStore {                          // active-project pointer, seed flags
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

interface StorageBackend {
  projects: ProjectStore
  snapshots: SnapshotStore
  breakpoints: BreakpointStore
  courses: CourseStore
  kv: KeyValueStore
}
```

Notes:
- **ZIP I/O is not a backend method.** It's serialization that *composes* `projects.load` + `projects.create`; keep it a pure util (`@adapters` or `@core`) taking a `ProjectStore`. Same for `textToBytes`/`bytesToText` (→ `@core`) and `MANIFEST_PATH` (→ a `@ports` constant).
- **Active project lives in the URL now** (recent change) — `kv` only needs seed flags + any future prefs. The `getActiveProjectId`/`setActiveProjectId` pair can shrink.
- **Blobs / content-addressing** stay an *implementation detail* of the IDB `SnapshotStore` — not in the port. A remote backend might store snapshots differently.

## Error convention — pick one

The split (`Result` in the port vs throwing raw fns) must be resolved. Two options:
- **Throw typed `StorageError`** (simplest; matches how `store.ts` is already written; try/catch at the boundary). Recommended — least churn.
- **`Result<T, StorageError>` everywhere** (explicit; matches the existing port + `BuildService`). More churn in the store.
Decide once; don't keep both.

## Migration plan (incremental, ship-at-every-step)

1. **Define `StorageBackend`** (+ sub-stores) in `@ports`, superseding/absorbing `ProjectRepository`. Move `Manifest`→`ProjectManifestV2` type usage off `@adapters` (fixes the `AssetPanel`/`MenuBar` type leaks). Pick the error convention.
2. **Make `storage-idb` implement it** (`createIdbStorage(): StorageBackend`) — mostly re-grouping the 42 existing functions; keep them internal.
3. **Inject the backend through the workbench** and **rewrite `store.ts`** to call `backend.*` instead of raw imports. This is the big one (the store touches ~20 fns) but mechanical.
4. **Move `templates.ts` / `courses.ts` / `course-project.ts` / `course-fetch.ts`** onto the backend (they currently call `createProject`/`loadProject`/`installRemoteCourse` directly).
5. **Extract a `HistoryService`** (or expose snapshot ops via the backend through a service) so `HistoryDialog` stops importing `diffSnapshots` from `@adapters` — removes the last `ui → adapters` value-import leak.
6. **Complete the memory adapter** to the full `StorageBackend` and add a contract harness (`assertStorageBackend`) — same pattern as the toolchain/plugin harnesses. This *proves* generality and guards the next adapter.
7. **(Later) second real adapter** — remote/server or OPFS — drops in behind the port. This is the actual payoff and a good v-next milestone.

## Risks / decisions

- **`store.ts` is the chokepoint** — large, hook-based, tightly bound to the raw fns. Step 3 is the bulk of the work; do it behind green tests.
- **Async everywhere already** — no new async coloring; the raw fns are async.
- **Don't over-abstract:** ZIP, blob GC, content hashing, and migrations are IDB-flavoured — keep them out of the port (implementation details), or a remote adapter inherits IDB assumptions.
- **Scope guard:** a *remote* backend implies auth/sync/conflict resolution — a separate epic. This research is about the *seam*, so that backend can be written without touching the app.

## Recommendation

Storage needs a **real, complete `StorageBackend` port** and the consumers rewired to it. The plumbing (port + IDB impl + memory impl + contract harness) is a contained, low-risk refactor that pays for itself the moment a second backend (remote sync for the public app, or OPFS) is wanted — and it deletes the dead `ProjectRepository` + the `ui → adapters` leaks along the way. Sequence: steps 1–2 (define + implement) and 6 (harness) first; step 3 (rewire `store.ts`) is the milestone-sized chunk; 4–5 follow; 7 is the future backend.
