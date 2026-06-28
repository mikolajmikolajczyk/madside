// Build-time GitHub persistence capability (#158).
//
// Both values are PUBLIC — no secrets live here. The gh-auth broker
// (Cloudflare Worker) holds the App's client_secret; the browser only ever sees
// the broker URL and the App's public client_id. They are injected at build time
// via Vite env (VITE_GH_*), wired by the Pages workflow.
//
// Capability = BOTH present + non-empty. A partial/absent config is treated as
// "not configured": madside runs exactly as today — browser-only, no account, no
// GitHub UI, no errors (forks and local dev get this for free). Nothing else in
// the app references GitHub unless `githubAvailable` is true.

export interface GitHubConfig {
  /** gh-auth broker (Cloudflare Worker) base URL, no trailing slash. */
  readonly brokerUrl: string;
  /** GitHub App public client_id, e.g. "Iv1.xxxx". */
  readonly clientId: string;
}

/** Read a VITE_* var with the same guard the workbench uses, trimmed to undefined
 *  when blank. Static member access so Vite replaces it at build time (dynamic
 *  `import.meta.env[key]` would NOT be inlined). */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** The injected GitHub config, or `null` when this build is not configured for
 *  GitHub persistence. */
export function loadGitHubConfig(): GitHubConfig | null {
  const env =
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : undefined;
  const brokerUrl = clean(env?.VITE_GH_BROKER_URL);
  const clientId = clean(env?.VITE_GH_CLIENT_ID);
  if (!brokerUrl || !clientId) return null;
  return { brokerUrl: brokerUrl.replace(/\/+$/, ""), clientId };
}

/** Resolved once at module load. */
export const githubConfig: GitHubConfig | null = loadGitHubConfig();

/** Whether the GitHub persistence layer is available in this build. Consumers
 *  (sign-in, push/pull, UI) must gate on this; when false they must not exist. */
export const githubAvailable: boolean = githubConfig !== null;
