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
  getDefaultBranch,
  getRepoTree,
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
const branchKey = (projectId: string) => `madside.github.branch.${projectId}`;
const defBranchKey = (repo: string) => `madside.github.defbranch.${repo}`;

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

/** Fetch + cache a repo's real default branch (e.g. master) so GitHub links don't
 *  guess wrong. Best-effort; call when a repo is selected. */
export async function cacheRepoDefaultBranch(fetch: GhFetch, repo: string): Promise<string> {
  const branch = await getDefaultBranch(fetch, parseRepo(repo));
  try {
    localStorage.setItem(defBranchKey(repo), branch);
  } catch {
    /* best-effort */
  }
  return branch;
}

/** Branch for a project's GitHub links: the one it last synced on, else the repo's
 *  cached default, else 'main' as a last resort. */
function linkBranch(repo: string, projectId: string): string {
  return readLS(branchKey(projectId)) ?? readLS(defBranchKey(repo)) ?? "main";
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
): Promise<PushResult> {
  const target = parseRepo(repo);
  const loaded = await storage.projects.load(projectId);
  if (!loaded) throw new Error(`project ${projectId} not found`);

  const files: SyncFile[] = loaded.files
    .filter((f) => !f.path.startsWith(GENERATED_DIR))
    .map((f) => ({ path: f.path, content: f.content }));

  const message = note?.trim() ? note.trim() : `Save ${loaded.project.name} from madside`;
  const basePath = `projects/${remoteSlug(projectId)}`;

  const result = await withApiErrors(() => pushFiles(fetch, target, basePath, files, message));
  setSynced(projectId, result.commitSha);
  setBranch(projectId, result.branch);
  return result;
}

/** Remove a project's folder from the repo (one commit). Explicit + destructive.
 *  Returns false if it wasn't there. Never touches local storage. */
export async function removeProjectFromGitHub(
  fetch: GhFetch,
  repo: string,
  projectId: string,
): Promise<boolean> {
  const target = parseRepo(repo);
  const slug = remoteSlug(projectId);
  const res = await withApiErrors(() =>
    deleteSubtree(fetch, target, `projects/${slug}`, `Remove ${slug} from madside`),
  );
  return res !== null;
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
      if (m && e.type === "blob") manifestSha.set(m[1]!, e.sha);
    }
    const out: RemoteProject[] = [];
    for (const [slug, sha] of manifestSha) {
      let name = slug;
      try {
        const bytes = await fetchBlob(fetch, target, sha);
        name = (JSON.parse(dec.decode(bytes)) as { name?: string }).name ?? slug;
      } catch {
        /* keep slug as name */
      }
      out.push({ slug, name });
    }
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
    const files = await pullSubtree(fetch, target, tree, `projects/${slug}`);
    if (files.length === 0) throw new Error(`no project "${slug}" in ${repo}`);

    const manifestFile = files.find((f) => f.path === MANIFEST_PATH);
    if (!manifestFile) throw new Error(`project "${slug}" has no ${MANIFEST_PATH}`);
    const parsed = parseProjectManifest(JSON.parse(dec.decode(manifestFile.content)));
    if (!parsed.ok) throw new Error(`project "${slug}": ${parsed.error.message}`);
    const manifest = parsed.value;

    const existing = (await storage.projects.list()).find((p) => remoteSlug(p.id) === slug);
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
      setSynced(existing.id, tree.commitSha);
      setBranch(existing.id, tree.branch);
      return { projectId: existing.id, created: false };
    }

    const row = await storage.projects.create(
      manifest.name,
      files.map((f) => ({ path: f.path, content: f.content })),
      manifest,
    );
    setRemoteSlug(row.id, slug);
    setSynced(row.id, tree.commitSha);
    setBranch(row.id, tree.branch);
    return { projectId: row.id, created: true };
  });
}
