import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { githubConfig } from "./github-config";
import { cacheRepoDefaultBranch } from "./github-sync";
import { GitHubAuth, type GitHubAuthProvider } from "@adapters/github-auth";

// GitHub auth wiring lives in @app — the composition layer that hands concrete
// adapters to the UI (ADR-0002). The whole layer is gated on build-time config
// (#158): when GitHub isn't configured the context still mounts but reports
// `available: false`, so the UI simply renders no GitHub affordances. (#159)

export interface GitHubUser {
  login: string;
  avatarUrl?: string;
}

const REPO_KEY = "madside.github.repo";

export interface GitHubState {
  /** Build configured for GitHub at all (githubAvailable). */
  available: boolean;
  /** True once the boot OAuth-callback check + initial probe have run. */
  ready: boolean;
  signedIn: boolean;
  user: GitHubUser | null;
  /** Last auth error (callback/probe), surfaced to the UI. */
  error: string | null;
  /** Selected dedicated repo ("owner/repo"), persisted per device. */
  repo: string | null;
  setRepo: (repo: string | null) => void;
  /** Start the OAuth redirect. No-op when unavailable. */
  signIn: () => void;
  signOut: () => void;
  /** The underlying provider (token-attaching fetch), or null when unavailable.
   *  Consumed by github-sync (push/pull). */
  auth: GitHubAuthProvider | null;
}

const GitHubContext = createContext<GitHubState | null>(null);

async function probeUser(auth: GitHubAuthProvider): Promise<GitHubUser | null> {
  if (!auth.isAuthenticated()) return null;
  const res = await auth.fetch("https://api.github.com/user");
  if (!res.ok) return null;
  const u = (await res.json()) as { login: string; avatar_url?: string };
  return { login: u.login, avatarUrl: u.avatar_url };
}

export function GitHubProvider({ children }: { children: ReactNode }) {
  const auth = useMemo<GitHubAuthProvider | null>(
    () =>
      githubConfig
        ? new GitHubAuth({
            clientId: githubConfig.clientId,
            workerUrl: githubConfig.brokerUrl,
            // Callback = site ROOT: GitHub Pages has no SPA fallback, so a deep
            // path would 404. handleCallback() reads code/state from any URL.
            redirectUri: location.origin + "/",
          })
        : null,
    [],
  );

  const [ready, setReady] = useState(!auth);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepoState] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(REPO_KEY) : null,
  );

  const setRepo = useCallback((next: string | null) => {
    setRepoState(next);
    if (typeof localStorage === "undefined") return;
    if (next) localStorage.setItem(REPO_KEY, next);
    else localStorage.removeItem(REPO_KEY);
  }, []);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    void (async () => {
      try {
        await auth.handleCallback(); // no-op when there's no ?code in the URL
        const u = await probeUser(auth);
        if (!cancelled) setUser(u);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Cache the repo's real default branch (master vs main) so GitHub links are right.
  useEffect(() => {
    if (!auth || !repo) return;
    void cacheRepoDefaultBranch((url, init) => auth.fetch(url, init), repo).catch(() => {});
  }, [auth, repo]);

  const signIn = useCallback(() => {
    setError(null);
    void auth?.login();
  }, [auth]);

  const signOut = useCallback(() => {
    auth?.logout();
    setUser(null);
  }, [auth]);

  const value = useMemo<GitHubState>(
    () => ({
      available: !!auth,
      ready,
      signedIn: user !== null,
      user,
      error,
      repo,
      setRepo,
      signIn,
      signOut,
      auth,
    }),
    [auth, ready, user, error, repo, setRepo, signIn, signOut],
  );

  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider (mirrors workbench-context)
export function useGitHub(): GitHubState {
  const ctx = useContext(GitHubContext);
  if (!ctx) throw new Error("useGitHub called outside <GitHubProvider>");
  return ctx;
}
