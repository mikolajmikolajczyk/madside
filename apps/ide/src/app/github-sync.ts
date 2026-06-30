// App-level GitHub sync service (#160 push, #161 pull/browse). Bridges the
// storage layer + injected GitHub auth to the pure `@madside/github-sync`:
// push a project's source under projects/<slug>/, browse the repo's projects,
// and pull one back into IDB. Explicit actions only — never on edit/save.
//
// Identity: the repo folder slug == the local projectId for projects created
// here (push uses it directly). A *pulled* project gets a fresh local id mapped
// to its slug (storage.projects.create can't take an id), and push then honours
// that mapping — so push/pull round-trip without duplicating folders.

import {
  GitHubApiError,
  deleteSubtree,
  fetchBlob,
  getRepoTree,
  getSubtreeSha,
  subtreeSha,
  pullSubtree,
  pushFiles,
  type GhFetch,
  type PushResult,
  type SyncFile,
} from "@madside/github-sync";
import { parseProjectManifest, type StorageBackend } from "@ports";
import { MANIFEST_PATH } from "@madside/storage-shared";

// Mirror project-zip.ts: publish source, skip the reproducible build output.
const GENERATED_DIR = "generated/";

const syncedKey = (projectId: string) => `madside.github.synced.${projectId}`;
const slugKey = (projectId: string) => `madside.github.slug.${projectId}`;
const repoKey = (projectId: string) => `madside.github.repo.${projectId}`;
const courseRepoKey = (courseId: string) => `madside.github.course-repo.${courseId}`;
const branchKey = (projectId: string) => `madside.github.branch.${projectId}`;
const subtreeKey = (projectId: string) => `madside.github.subtree.${projectId}`;
const AUTOSYNC_KEY = "madside.github.autosync";
const DEBOUNCE_KEY = "madside.github.autosync.debounce";
/** Default idle delay before an auto-push — gentle on GitHub rate limits. */
export const AUTOSYNC_DEBOUNCE_DEFAULT_MS = 30_000;
const AUTOSYNC_DEBOUNCE_MIN_MS = 2_000;

function setLS(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* best-effort */
  }
}

/** Auto-sync is OFF by default; opt in per device (e.g. on the iPad used for
 *  evening sessions, where remembering manual commits is the real pain). */
export function autoSyncEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOSYNC_KEY) === "1";
  } catch {
    return false;
  }
}
export function setAutoSyncEnabled(on: boolean): void {
  setLS(AUTOSYNC_KEY, on ? "1" : "0");
}

/** Idle delay (ms) before an auto-push; per device, default 30s, floored at 2s. */
export function autoSyncDebounceMs(): number {
  try {
    const raw = localStorage.getItem(DEBOUNCE_KEY);
    const n = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return AUTOSYNC_DEBOUNCE_DEFAULT_MS;
    return Math.max(AUTOSYNC_DEBOUNCE_MIN_MS, Math.round(n));
  } catch {
    return AUTOSYNC_DEBOUNCE_DEFAULT_MS;
  }
}
export function setAutoSyncDebounceMs(ms: number): void {
  setLS(DEBOUNCE_KEY, String(Math.max(AUTOSYNC_DEBOUNCE_MIN_MS, Math.round(ms))));
}

/** Git tree sha of this project's folder at last sync — per-project conflict
 *  marker (changes iff the project's content changed remotely). */
/** The repo a project is bound to (set on import/first push), or null when it
 *  just follows the device's default repo. A binding lets one project sync to a
 *  different repo than the rest — e.g. a project imported from a friend's repo
 *  while you keep working against your own. */
export function projectRepo(projectId: string): string | null {
  return readLS(repoKey(projectId));
}
export function setProjectRepo(projectId: string, repo: string | null): void {
  setLS(repoKey(projectId), repo);
}
/** Repo a project actually syncs to: its own binding, else the device default. */
export function effectiveRepo(projectId: string, defaultRepo: string | null): string | null {
  return projectRepo(projectId) ?? defaultRepo;
}

/** The repo a draft course publishes to (set on first publish / on pulling a
 *  draft from a repo), or null until chosen. Mirrors per-project binding. */
export function courseRepo(courseId: string): string | null {
  return readLS(courseRepoKey(courseId));
}
export function setCourseRepo(courseId: string, repo: string | null): void {
  setLS(courseRepoKey(courseId), repo);
}

export function syncedSubtreeSha(projectId: string): string | null {
  return readLS(subtreeKey(projectId));
}
function setSyncedSubtree(projectId: string, sha: string | null): void {
  setLS(subtreeKey(projectId), sha);
}

function setBranch(projectId: string, branch: string): void {
  try {
    localStorage.setItem(branchKey(projectId), branch);
  } catch {
    /* best-effort */
  }
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Branch for a project's GitHub links: the one it last synced on, else 'main'. */
function linkBranch(_repo: string, projectId: string): string {
  return readLS(branchKey(projectId)) ?? "main";
}

/** Remote folder slug for a project — an explicit mapping (set on pull) or the
 *  projectId itself (projects created + first-pushed here). */
export function remoteSlug(projectId: string): string {
  try {
    return localStorage.getItem(slugKey(projectId)) ?? projectId;
  } catch {
    return projectId;
  }
}

function setRemoteSlug(projectId: string, slug: string): void {
  try {
    localStorage.setItem(slugKey(projectId), slug);
  } catch {
    /* best-effort */
  }
}

function setSynced(projectId: string, sha: string): void {
  try {
    localStorage.setItem(syncedKey(projectId), sha);
  } catch {
    /* best-effort */
  }
}

/** Last commit SHA this device pushed/pulled for a project, if any. */
export function lastSyncedSha(projectId: string): string | null {
  try {
    return localStorage.getItem(syncedKey(projectId));
  } catch {
    return null;
  }
}

function parseRepo(repo: string): { owner: string; repo: string } {
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) throw new Error(`bad repo "${repo}" (expected owner/repo)`);
  return { owner: repo.slice(0, slash), repo: repo.slice(slash + 1) };
}

/** Pull GitHub's own error reason out of the API response body for the toast. */
function describeApiError(e: GitHubApiError): string {
  let reason = "";
  try {
    reason = (JSON.parse(e.body ?? "") as { message?: string }).message ?? "";
  } catch {
    /* body wasn't JSON */
  }
  // GitHub returns 404 on a write the App isn't permitted to make (to avoid
  // leaking the repo's existence) — point the user at the likely cause.
  if (e.status === 404) {
    return `${e.message} — repo not found, or the GitHub App isn't installed with Contents: read & write on it`;
  }
  return reason ? `${e.message} — ${reason}` : e.message;
}

async function withApiErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GitHubApiError) throw new Error(describeApiError(e));
    throw e;
  }
}

const dec = new TextDecoder();

/** Push a project's source to `owner/repo` under `projects/<slug>/` as one
 *  atomic commit. Records the resulting commit SHA (last-synced) per project. */
export async function pushProjectToGitHub(
  storage: StorageBackend,
  fetch: GhFetch,
  repo: string,
  projectId: string,
  note?: string,
  amend = true,
): Promise<PushResult> {
  const target = parseRepo(repo);
  const loaded = await storage.projects.load(projectId);
  if (!loaded) throw new Error(`project ${projectId} not found`);

  const files: SyncFile[] = loaded.files
    .filter((f) => !f.path.startsWith(GENERATED_DIR))
    .map((f) => ({ path: f.path, content: f.content }));

  const message = note?.trim() ? note.trim() : `Save ${loaded.project.name} from madside`;
  const basePath = `projects/${remoteSlug(projectId)}`;
  // Amend our own last commit (if HEAD still points at it) so repeated saves
  // don't pile up commits; pushFiles only amends when HEAD === this sha.
  const amendIfHead = amend ? (lastSyncedSha(projectId) ?? undefined) : undefined;

  const result = await withApiErrors(() =>
    pushFiles(fetch, target, basePath, files, message, { amendIfHead }),
  );
  setSynced(projectId, result.commitSha);
  setBranch(projectId, result.branch);
  setProjectRepo(projectId, repo); // bind to the repo we pushed to
  // Record our project's new subtree sha (per-project conflict marker).
  try {
    setSyncedSubtree(projectId, await getSubtreeSha(fetch, target, basePath));
  } catch {
    /* best-effort */
  }
  return result;
}

/** Current remote subtree sha for a project's folder (cheap-ish: one tree read). */
export async function remoteSubtreeSha(fetch: GhFetch, repo: string, projectId: string): Promise<string | null> {
  return withApiErrors(() => getSubtreeSha(fetch, parseRepo(repo), `projects/${remoteSlug(projectId)}`));
}

/** Publish an authored course to the repo under `courses/<slug>/` as one atomic
 *  commit (#165). Wholesale subtree replace — added/edited/deleted lessons all
 *  propagate. Files are course-root-relative (course.json + lessons/**). */
export async function publishCourseToGitHub(
  fetch: GhFetch,
  repo: string,
  slug: string,
  files: SyncFile[],
  message: string,
): Promise<PushResult> {
  const target = parseRepo(repo);
  return withApiErrors(() => pushFiles(fetch, target, `courses/${slug}`, files, message));
}

/** Remove a project's folder from the repo (one commit). Explicit + destructive.
 *  Returns false if it wasn't there. Never touches local storage. */
export async function removeProjectFromGitHub(
  fetch: GhFetch,
  repo: string,
  projectId: string,
): Promise<number> {
  const target = parseRepo(repo);
  const slug = remoteSlug(projectId);
  const res = await withApiErrors(() =>
    deleteSubtree(fetch, target, `projects/${slug}`, `Remove ${slug} from madside`),
  );
  return res ? res.deleted : 0;
}

/** GitHub web URLs for a project: its folder + the commit history for that path
 *  (Git's per-path history, surfaced for free). */
export function projectGitHubUrls(repo: string, projectId: string): { folder: string; history: string } {
  const slug = remoteSlug(projectId);
  const branch = linkBranch(repo, projectId);
  const base = `https://github.com/${repo}`;
  return {
    folder: `${base}/tree/${branch}/projects/${slug}`,
    history: `${base}/commits/${branch}/projects/${slug}`,
  };
}

export interface RemoteProject {
  slug: string;
  name: string;
}

/** List the projects in `owner/repo` (folders under `projects/` with a manifest). */
export async function listRemoteProjects(fetch: GhFetch, repo: string): Promise<RemoteProject[]> {
  const target = parseRepo(repo);
  return withApiErrors(async () => {
    const tree = await getRepoTree(fetch, target);
    if (!tree) return [];
    const manifestSha = new Map<string, string>();
    for (const e of tree.entries) {
      const m = e.path.match(/^projects\/([^/]+)\/project\.json$/);
      // Ignore traversal-y folder names defensively.
      if (m && e.type === "blob" && m[1] !== "." && m[1] !== "..") manifestSha.set(m[1]!, e.sha);
    }
    // Fetch manifests in parallel (name = manifest.name, slug fallback).
    const out = await Promise.all(
      [...manifestSha].map(async ([slug, sha]) => {
        try {
          const bytes = await fetchBlob(fetch, target, sha);
          return { slug, name: (JSON.parse(dec.decode(bytes)) as { name?: string }).name ?? slug };
        } catch {
          return { slug, name: slug };
        }
      }),
    );
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Pull a project (`projects/<slug>/`) from the repo into IDB. Reconciles into
 *  an existing mapped project (taking a safety snapshot first — remote wins, no
 *  silent clobber, no merge engine) or creates a new local project. */
export async function pullProjectToIdb(
  storage: StorageBackend,
  fetch: GhFetch,
  repo: string,
  slug: string,
): Promise<{ projectId: string; created: boolean }> {
  const target = parseRepo(repo);
  return withApiErrors(async () => {
    const tree = await getRepoTree(fetch, target);
    if (!tree) throw new Error("the repo is empty");
    // A truncated tree means pullSubtree sees only part of the project — pulling
    // would then delete the unseen local files. Refuse rather than lose data.
    if (tree.truncated) throw new Error("repo tree is too large (truncated) — cannot pull safely");
    const files = await pullSubtree(fetch, target, tree, `projects/${slug}`);
    if (files.length === 0) throw new Error(`no project "${slug}" in ${repo}`);

    const manifestFile = files.find((f) => f.path === MANIFEST_PATH);
    if (!manifestFile) throw new Error(`project "${slug}" has no ${MANIFEST_PATH}`);
    const parsed = parseProjectManifest(JSON.parse(dec.decode(manifestFile.content)));
    if (!parsed.ok) throw new Error(`project "${slug}": ${parsed.error.message}`);
    const manifest = parsed.value;

    // Match by (repo, slug) — two different repos can hold the same slug, so the
    // slug alone is ambiguous once projects can be bound to different repos. Fall
    // back to an unbound legacy project with this slug and adopt it to this repo.
    const all = await storage.projects.list();
    const existing =
      all.find((p) => projectRepo(p.id) === repo && remoteSlug(p.id) === slug) ??
      all.find((p) => projectRepo(p.id) == null && remoteSlug(p.id) === slug);
    if (existing) {
      // Safety backup before remote overwrites local (no merge engine).
      const loaded = await storage.projects.load(existing.id);
      if (loaded) {
        await storage.snapshots.create(
          existing.id,
          `Before pull from ${repo}`,
          loaded.files.map((f) => ({ path: f.path, content: f.content })),
        );
      }
      const remotePaths = new Set(files.map((f) => f.path));
      for (const f of files) await storage.projects.writeFile(existing.id, f.path, f.content);
      if (loaded) {
        for (const f of loaded.files) {
          // Drop local files the remote no longer has — but keep build output.
          if (!f.path.startsWith(GENERATED_DIR) && !remotePaths.has(f.path)) {
            await storage.projects.deleteFile(existing.id, f.path);
          }
        }
      }
      setRemoteSlug(existing.id, slug);
      setProjectRepo(existing.id, repo);
      setSynced(existing.id, tree.commitSha);
      setBranch(existing.id, tree.branch);
      setSyncedSubtree(existing.id, subtreeSha(tree, `projects/${slug}`));
      return { projectId: existing.id, created: false };
    }

    const row = await storage.projects.create(
      manifest.name,
      files.map((f) => ({ path: f.path, content: f.content })),
      manifest,
    );
    setRemoteSlug(row.id, slug);
    setProjectRepo(row.id, repo);
    setSynced(row.id, tree.commitSha);
    setBranch(row.id, tree.branch);
    setSyncedSubtree(row.id, subtreeSha(tree, `projects/${slug}`));
    return { projectId: row.id, created: true };
  });
}

// --- Courses in the repo (browse + pull-as-draft) -------------------------

export interface RemoteCourse {
  slug: string;
  title: string;
}

/** List courses in the repo (folders under courses/ with a course.json). */
export async function listRemoteCourses(fetch: GhFetch, repo: string): Promise<RemoteCourse[]> {
  const target = parseRepo(repo);
  return withApiErrors(async () => {
    const tree = await getRepoTree(fetch, target);
    if (!tree) return [];
    const sha = new Map<string, string>();
    for (const e of tree.entries) {
      const m = e.path.match(/^courses\/([^/]+)\/course\.json$/);
      if (m && e.type === "blob" && m[1] !== "." && m[1] !== "..") sha.set(m[1]!, e.sha);
    }
    const out = await Promise.all(
      [...sha].map(async ([slug, s]) => {
        try {
          const b = await fetchBlob(fetch, target, s);
          return { slug, title: (JSON.parse(dec.decode(b)) as { title?: string }).title ?? slug };
        } catch {
          return { slug, title: slug };
        }
      }),
    );
    return out.sort((a, b) => a.title.localeCompare(b.title));
  });
}
