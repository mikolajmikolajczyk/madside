// App-level GitHub push service (#160). Bridges the storage layer + the injected
// GitHub auth to the pure `@madside/github-sync` pusher: load a project from IDB,
// drop build output, and commit its source under `projects/<slug>/` in the user's
// repo. Explicit action only — never called on edit/save.

import { GitHubApiError, pushFiles, type GhFetch, type PushResult, type SyncFile } from "@madside/github-sync";
import type { StorageBackend } from "@ports";

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

// Mirror project-zip.ts: publish source, skip the reproducible build output.
const GENERATED_DIR = "generated/";

const syncedKey = (projectId: string) => `madside.github.synced.${projectId}`;

/** Push a project's source to `owner/repo` under `projects/<projectId>/` as one
 *  atomic commit. Records the resulting commit SHA (last-synced) per project. */
export async function pushProjectToGitHub(
  storage: StorageBackend,
  fetch: GhFetch,
  repo: string,
  projectId: string,
  note?: string,
): Promise<PushResult> {
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) {
    throw new Error(`bad repo "${repo}" (expected owner/repo)`);
  }
  const owner = repo.slice(0, slash);
  const name = repo.slice(slash + 1);

  const loaded = await storage.projects.load(projectId);
  if (!loaded) throw new Error(`project ${projectId} not found`);

  const files: SyncFile[] = loaded.files
    .filter((f) => !f.path.startsWith(GENERATED_DIR))
    .map((f) => ({ path: f.path, content: f.content }));

  const message = note?.trim() ? note.trim() : `Save ${loaded.project.name} from madside`;

  let result: PushResult;
  try {
    result = await pushFiles(fetch, { owner, repo: name }, `projects/${projectId}`, files, message);
  } catch (e) {
    if (e instanceof GitHubApiError) throw new Error(describeApiError(e));
    throw e;
  }
  try {
    localStorage.setItem(syncedKey(projectId), result.commitSha);
  } catch {
    /* non-fatal: last-synced tracking is best-effort */
  }
  return result;
}

/** Last commit SHA this device pushed/pulled for a project, if any. */
export function lastSyncedSha(projectId: string): string | null {
  try {
    return localStorage.getItem(syncedKey(projectId));
  } catch {
    return null;
  }
}
