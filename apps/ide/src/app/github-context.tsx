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
import { GitHubAuth, type GitHubAuthProvider } from "@adapters/github-auth";

// GitHub auth wiring lives in @app — the composition layer that hands concrete
// adapters to the UI (ADR-0002). The whole layer is gated on build-time config
// (#158): when GitHub isn't configured the context still mounts but reports
// `available: false`, so the UI simply renders no GitHub affordances. (#159)

export interface GitHubUser {
  login: string;
  avatarUrl?: string;
}


/** Coarse auto-sync state for the status indicator. */
export type GitHubSyncStatus = "off" | "idle" | "pending" | "syncing" | "paused" | "error";

export interface GitHubState {
  /** Build configured for GitHub at all (githubAvailable). */
  available: boolean;
  /** True once the boot OAuth-callback check + initial probe have run. */
  ready: boolean;
  signedIn: boolean;
  user: GitHubUser | null;
  /** Last auth error (callback/probe), surfaced to the UI. */
  error: string | null;
  /** Bumped after any git write (push/pull/remove/import/publish) so repo-content
   *  views (project/course lists) refetch. */
  rev: number;
  refresh: () => void;
  /** Auto-sync status (for the status bar); driven by the auto-sync hook. */
  syncStatus: GitHubSyncStatus;
  setSyncStatus: (s: GitHubSyncStatus) => void;
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
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  const [syncStatus, setSyncStatus] = useState<GitHubSyncStatus>("off");

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

  // Re-probe auth when the tab regains focus — a sessionStorage token can expire
  // silently (notably on iPad), and without this the UI would still claim
  // "signed in" while every sync 401s. Flips to signed-out so it's visible.
  useEffect(() => {
    if (!auth) return;
    const recheck = () => {
      void (async () => {
        try {
          setUser(await probeUser(auth));
        } catch {
          setUser(null);
        }
      })();
    };
    const onVis = () => { if (document.visibilityState === "visible") recheck(); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [auth]);

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
      rev,
      refresh,
      syncStatus,
      setSyncStatus,
      signIn,
      signOut,
      auth,
    }),
    [auth, ready, user, error, rev, refresh, syncStatus, signIn, signOut],
  );

  return <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider (mirrors workbench-context)
export function useGitHub(): GitHubState {
  const ctx = useContext(GitHubContext);
  if (!ctx) throw new Error("useGitHub called outside <GitHubProvider>");
  return ctx;
}
