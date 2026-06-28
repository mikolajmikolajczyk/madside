import type { GitHubAuthProvider } from "@adapters/github-auth";

// List the repos the user granted this GitHub App (#159). Access is per
// *installation* — the user installs the App on one or more repos; this walks
// their installations and collects the repositories. All calls go straight to
// api.github.com via the token-attaching auth.fetch (broker not involved).

export interface RepoRef {
  /** "owner/repo". */
  fullName: string;
  private: boolean;
}

interface InstallationsResponse {
  installations: { id: number }[];
}
interface ReposResponse {
  repositories: { full_name: string; private: boolean }[];
}

export async function listAccessibleRepos(auth: GitHubAuthProvider): Promise<RepoRef[]> {
  const insRes = await auth.fetch("https://api.github.com/user/installations");
  if (!insRes.ok) throw new Error(`installations: ${insRes.status}`);
  const { installations } = (await insRes.json()) as InstallationsResponse;

  const repos: RepoRef[] = [];
  for (const inst of installations ?? []) {
    const r = await auth.fetch(
      `https://api.github.com/user/installations/${inst.id}/repositories?per_page=100`,
    );
    if (!r.ok) continue;
    const { repositories } = (await r.json()) as ReposResponse;
    for (const repo of repositories) {
      repos.push({ fullName: repo.full_name, private: repo.private });
    }
  }
  // Stable, de-duplicated by full name.
  const seen = new Set<string>();
  return repos
    .filter((r) => (seen.has(r.fullName) ? false : (seen.add(r.fullName), true)))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Install link for the App (when the slug is configured), else null. */
export function appInstallUrl(appSlug: string | undefined): string | null {
  return appSlug ? `https://github.com/apps/${appSlug}/installations/new` : null;
}

// madside owns `projects/` + an optional `settings.json` at the repo root; these
// repo-meta names are also fine in a "dedicated" repo. Anything else at the root
// means the repo already holds unrelated content → a soft warning (not a block).
const ALLOWED_ROOT = new Set(["projects", "settings.json"]);
const META_ROOT = /^(README|LICENSE|LICENCE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)/i;

/** True if the repo root already contains content unrelated to the madside
 *  layout. Empty repos and API errors return false (never nag spuriously). */
export async function repoRootHasOtherContent(
  auth: GitHubAuthProvider,
  fullName: string,
): Promise<boolean> {
  const res = await auth.fetch(`https://api.github.com/repos/${fullName}/contents/`);
  if (res.status === 404) return false; // empty repo
  if (!res.ok) return false;
  const entries = (await res.json()) as { name: string; type: string }[];
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (e) => !ALLOWED_ROOT.has(e.name) && !e.name.startsWith(".") && !META_ROOT.test(e.name),
  );
}
