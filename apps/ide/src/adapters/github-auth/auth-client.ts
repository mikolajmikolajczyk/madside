// Typed port of gh_broker's `github-auth.js` (the canonical OAuth-broker client).
// Keep behaviour in sync with ~/src/gh_broker/github-auth.js on broker updates.
//
// Talks to the gh-auth Cloudflare Worker for token exchange/refresh ONLY; the
// actual GitHub REST/Git calls go browser → api.github.com directly via `fetch()`
// below (which attaches the bearer + auto-refreshes on 401). Tokens live in
// sessionStorage (gone on tab close → re-auth per session). (#159)

const STORE_KEY = "gh_auth_tokens";
const PKCE_KEY = "gh_pkce_verifier";
const STATE_KEY = "gh_oauth_state";

export interface GitHubAuthConfig {
  /** GitHub App public client_id, e.g. "Iv1.xxxx". */
  clientId: string;
  /** gh-auth broker base URL. */
  workerUrl: string;
  /** OAuth redirect target — site ROOT (Pages has no SPA fallback). */
  redirectUri: string;
}

interface TokenSet {
  access_token?: string;
  token_type?: string;
  expires_in?: number | null;
  refresh_token?: string | null;
  refresh_token_expires_in?: number | null;
  /** Computed locally from expires_in (60 s margin). */
  expires_at?: number | null;
}

/** Capabilities consumers (sign-in UI, github-sync) depend on. */
export interface GitHubAuthProvider {
  isAuthenticated(): boolean;
  login(): Promise<void>;
  handleCallback(): Promise<boolean>;
  logout(): void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

function b64url(bytes: ArrayBuffer): string {
  const s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(str: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
}

function randomString(len = 64): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return b64url(arr.buffer).slice(0, len);
}

export class GitHubAuth implements GitHubAuthProvider {
  private readonly clientId: string;
  private readonly workerUrl: string;
  private readonly redirectUri: string;

  constructor({ clientId, workerUrl, redirectUri }: GitHubAuthConfig) {
    this.clientId = clientId;
    this.workerUrl = workerUrl.replace(/\/$/, "");
    this.redirectUri = redirectUri;
  }

  isAuthenticated(): boolean {
    const t = this.tokens();
    return !!t?.access_token;
  }

  private tokens(): TokenSet | null {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as TokenSet | null;
    } catch {
      return null;
    }
  }

  private saveTokens(t: TokenSet): void {
    const now = Math.floor(Date.now() / 1000);
    const enriched: TokenSet = {
      ...t,
      expires_at: t.expires_in ? now + t.expires_in - 60 : null,
    };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(enriched));
  }

  logout(): void {
    sessionStorage.removeItem(STORE_KEY);
  }

  /** Step 1: redirect to GitHub with PKCE + state. */
  async login(): Promise<void> {
    const verifier = randomString(64);
    const challenge = b64url(await sha256(verifier));
    const state = randomString(32);

    sessionStorage.setItem(PKCE_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** Step 2: on the callback (site root) — exchange the code for a token.
   *  No-ops (returns false) when there's no `code` in the URL. */
  async handleCallback(): Promise<boolean> {
    const url = new URL(location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    if (!code) return false;

    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (!returnedState || returnedState !== expectedState) {
      throw new Error("State mismatch — aborted (possible CSRF).");
    }

    const verifier = sessionStorage.getItem(PKCE_KEY);
    if (!verifier) {
      throw new Error("Missing PKCE verifier — start the login again.");
    }
    const res = await fetch(`${this.workerUrl}/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: this.redirectUri,
      }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Code exchange failed: ${e.error ?? res.status}`);
    }
    this.saveTokens((await res.json()) as TokenSet);

    sessionStorage.removeItem(PKCE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
    return true;
  }

  private async refresh(): Promise<void> {
    const t = this.tokens();
    if (!t?.refresh_token) throw new Error("No refresh_token — log in again.");
    const res = await fetch(`${this.workerUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId, refresh_token: t.refresh_token }),
    });
    if (!res.ok) {
      this.logout();
      throw new Error("Refresh failed — log in again.");
    }
    this.saveTokens((await res.json()) as TokenSet);
  }

  private async validToken(): Promise<string> {
    let t = this.tokens();
    if (!t?.access_token) throw new Error("Not authenticated.");
    if (t.expires_at && Math.floor(Date.now() / 1000) >= t.expires_at) {
      await this.refresh();
      t = this.tokens();
    }
    if (!t?.access_token) throw new Error("Not authenticated.");
    return t.access_token;
  }

  /** fetch against api.github.com with an auto-token; refreshes once on 401. */
  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    let token = await this.validToken();
    const call = (tok: string): Promise<Response> =>
      fetch(input, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.headers ?? {}),
          Authorization: `Bearer ${tok}`,
        },
      });

    let res = await call(token);
    if (res.status === 401) {
      await this.refresh();
      token = await this.validToken();
      res = await call(token);
    }
    return res;
  }
}
