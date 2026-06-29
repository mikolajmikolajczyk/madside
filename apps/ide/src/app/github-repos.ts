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
