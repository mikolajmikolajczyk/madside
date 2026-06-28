import { useEffect, useState } from "react";
import {
  useGitHub,
  githubConfig,
  listAccessibleRepos,
  appInstallUrl,
  repoRootHasOtherContent,
  type RepoRef,
} from "@app";
import "./GitHubDialog.css";

/** GitHub account panel (#159). Optional sign-in via the gh-auth broker, then
 *  pick the dedicated repo madside reads/writes. The whole feature is gated on
 *  build-time config; this dialog is only reachable when `available` is true. */
export function GitHubDialog() {
  const gh = useGitHub();

  if (!gh.available) {
    return <p className="gh__muted">GitHub is not configured for this build.</p>;
  }

  return (
    <div className="gh">
      {gh.error && <p className="gh__error">{gh.error}</p>}

      {!gh.ready ? (
        <p className="gh__muted">Checking GitHub session…</p>
      ) : gh.signedIn && gh.user ? (
        <>
          <div className="gh__user">
            {gh.user.avatarUrl && (
              <img className="gh__avatar" src={gh.user.avatarUrl} alt="" width={32} height={32} />
            )}
            <span className="gh__login">
              Signed in as <strong>{gh.user.login}</strong>
            </span>
            <button type="button" className="ui-dialog__btn" onClick={gh.signOut}>
              Sign out
            </button>
          </div>
          <RepoPicker />
        </>
      ) : (
        <>
          <p className="gh__intro">
            Sign in to sync projects to a GitHub repo you own. madside stays usable without it —
            this only adds an explicit push/pull. Your files live in your repo; we store nothing.
          </p>
          <button type="button" className="ui-dialog__btn ui-dialog__btn--primary" onClick={gh.signIn}>
            Sign in with GitHub
          </button>
        </>
      )}
    </div>
  );
}

/** Lists the repos the user installed the App on, lets them pick the dedicated
 *  one, with a Refresh + a link to the install page. */
function RepoPicker() {
  const gh = useGitHub();
  const [repos, setRepos] = useState<RepoRef[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dirtyRoot, setDirtyRoot] = useState(false);
  const installUrl = appInstallUrl(githubConfig?.appSlug);

  useEffect(() => {
    if (!gh.auth) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccessibleRepos(gh.auth!);
        if (!cancelled) {
          setRepos(list);
          setListError(null);
        }
      } catch (e) {
        if (!cancelled) setListError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gh.auth, refreshKey]);

  // Soft check: does the selected repo's root already hold unrelated content?
  useEffect(() => {
    if (!gh.auth || !gh.repo) return;
    let cancelled = false;
    void (async () => {
      try {
        const dirty = await repoRootHasOtherContent(gh.auth!, gh.repo!);
        if (!cancelled) setDirtyRoot(dirty);
      } catch {
        /* never nag on errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gh.auth, gh.repo]);

  return (
    <div className="gh__repos">
      <div className="gh__repos-head">
        <span className="gh__repos-title">Project repo</span>
        <span className="gh__repos-actions">
          <button
            type="button"
            className="gh__link gh__linkbtn"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </button>
          {installUrl && (
            <a className="gh__link" href={installUrl} target="_blank" rel="noopener noreferrer">
              Add a repo…
            </a>
          )}
        </span>
      </div>

      {repos === null && !listError && <p className="gh__muted">Loading your repos…</p>}

      {repos && repos.length > 0 && (
        <ul className="gh__repo-list">
          {repos.map((r) => (
            <li key={r.fullName}>
              <label className="gh__repo">
                <input
                  type="radio"
                  name="gh-repo"
                  checked={gh.repo === r.fullName}
                  onChange={() => gh.setRepo(r.fullName)}
                />
                <span className="gh__repo-name">{r.fullName}</span>
                {r.private && <span className="gh__repo-tag">private</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {repos !== null && repos.length === 0 && !listError && (
        <p className="gh__muted">
          No repos granted yet. Install the App
          {installUrl ? " via “Add a repo…”" : ""}, then Refresh.
        </p>
      )}
      {listError && <p className="gh__error">Couldn’t list repos: {listError}. Try Refresh.</p>}

      {gh.repo && (
        <p className="gh__muted">
          Selected: <strong>{gh.repo}</strong>. Push/pull arrives in the next steps.
        </p>
      )}
      {gh.repo && dirtyRoot && (
        <p className="gh__warn">
          This repo already has other files at its root. A dedicated repo is recommended —
          madside will add a <code>projects/</code> folder alongside whatever is there.
        </p>
      )}
    </div>
  );
}
