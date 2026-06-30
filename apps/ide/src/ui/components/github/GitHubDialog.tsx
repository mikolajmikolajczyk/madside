import { useEffect, useRef, useState } from "react";
import {
  useGitHub,
  githubConfig,
  listAccessibleRepos,
  appInstallUrl,
  listRemoteProjects,
  pullProjectToIdb,
  listRemoteCourses,
  installCourseFromGitHub,
  courseSourceId,
  getCourse,
  projectRepo,
  remoteSlug,
  openLesson,
  autoSyncEnabled,
  setAutoSyncEnabled,
  autoSyncDebounceMs,
  setAutoSyncDebounceMs,
  useWorkbench,
  type RepoRef,
  type RemoteProject,
  type RemoteCourse,
} from "@app";
import "./GitHubDialog.css";

/** GitHub account panel (#159, #161). Sign in via the gh-auth broker, then import
 *  projects and courses from any repo you can access. Projects bind to the repo
 *  they're imported from / first saved to — there is no single "default repo".
 *  Gated on build-time config; reachable only when `available` is true. */
export function GitHubDialog({ onOpenProject }: { onOpenProject?: (projectId: string) => void }) {
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
          <ImportFromGitHub onOpenProject={onOpenProject} />
          <AutoSyncSettings />
        </>
      ) : (
        <>
          <p className="gh__intro">
            Sign in to sync projects to a GitHub repo you own. madside stays usable without it —
            this only adds an explicit push/pull. Your files live in your repo; we store nothing.
          </p>
          <div className="gh__signin">
            <button type="button" className="ui-dialog__btn ui-dialog__btn--primary" onClick={gh.signIn}>
              Sign in with GitHub
            </button>
            <a
              className="gh__help"
              href="https://madside.dev/docs/using/github/"
              target="_blank"
              rel="noopener noreferrer"
              title="What is this? Read about GitHub sync"
              aria-label="What is this? Read about GitHub sync"
            >
              ?
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** Browse a repo you can access and import its projects (→ local, bound to that
 *  repo) or open its courses as editable drafts. One repo picker drives both. */
function ImportFromGitHub({ onOpenProject }: { onOpenProject?: (projectId: string) => void }) {
  const gh = useGitHub();
  const workbench = useWorkbench();
  const [repos, setRepos] = useState<RepoRef[] | null>(null);
  const [repo, setRepo] = useState<string>("");
  const [projects, setProjects] = useState<RemoteProject[] | null>(null);
  const [courses, setCourses] = useState<RemoteCourse[] | null>(null);
  const [localBySlug, setLocalBySlug] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const installUrl = appInstallUrl(githubConfig?.appSlug);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Repos you can import from (your installations + collaborator repos).
  useEffect(() => {
    if (!gh.auth) return;
    const auth = gh.auth;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccessibleRepos(auth);
        if (cancelled) return;
        setRepos(list);
        setRepo((cur) => cur || list[0]?.fullName || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [gh.auth, gh.rev]);

  // List the chosen repo's projects + courses.
  useEffect(() => {
    if (!gh.auth || !repo) return;
    const auth = gh.auth;
    const f = (url: string, init?: RequestInit) => auth.fetch(url, init);
    let cancelled = false;
    void (async () => {
      try {
        const [ps, cs] = await Promise.all([listRemoteProjects(f, repo), listRemoteCourses(f, repo)]);
        if (!cancelled) { setProjects(ps); setCourses(cs); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [gh.auth, repo, refreshKey, gh.rev]);

  // Which of this repo's projects are already imported locally (slug → local id),
  // so we can label them instead of offering a confusing duplicate import.
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    void (async () => {
      const list = await workbench.storage.projects.list();
      if (cancelled) return;
      const m: Record<string, string> = {};
      for (const p of list) if (projectRepo(p.id) === repo) m[remoteSlug(p.id)] = p.id;
      setLocalBySlug(m);
    })();
    return () => { cancelled = true; };
  }, [repo, refreshKey, gh.rev, workbench]);

  const importProject = async (slug: string) => {
    if (!gh.auth || !repo) return;
    setBusy(`p:${slug}`);
    setError(null);
    try {
      const { projectId } = await pullProjectToIdb(workbench.storage, (u, i) => gh.auth!.fetch(u, i), repo, slug);
      gh.refresh();
      if (mounted.current) setBusy(null);
      onOpenProject?.(projectId); // closes the dialog
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : String(e)); setBusy(null); }
    }
  };

  // Install the course as a GitHub course (bound to its repo) and open it. If the
  // repo is writable it opens in the author surface (edit in-place); read-only ⇒
  // follow. No separate local draft — re-opening updates the same entry.
  const openCourse = async (slug: string) => {
    if (!gh.auth || !repo) return;
    setBusy(`c:${slug}`);
    setError(null);
    try {
      await installCourseFromGitHub(workbench.storage, repo, (u, i) => gh.auth!.fetch(u, i));
      const [owner, name] = repo.split("/");
      const courseId = courseSourceId({ owner: owner!, repo: name! }, slug);
      const lessonId = getCourse(courseId)?.lessons[0];
      if (!lessonId) throw new Error("course has no lessons");
      const projectId = await openLesson(workbench.storage, courseId, lessonId);
      gh.refresh();
      if (mounted.current) setBusy(null);
      onOpenProject?.(projectId);
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error ? e.message : String(e)); setBusy(null); }
    }
  };

  const canPushRepo = repos?.find((r) => r.fullName === repo)?.canPush ?? false;

  return (
    <div className="gh__repos">
      <div className="gh__repos-head">
        <span className="gh__repos-title">Import from GitHub</span>
        <span className="gh__repos-actions">
          <button type="button" className="gh__link gh__linkbtn" onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </button>
          {installUrl && (
            <a className="gh__link" href={installUrl} target="_blank" rel="noopener noreferrer">
              Add a repo…
            </a>
          )}
        </span>
      </div>

      {repos !== null && repos.length === 0 ? (
        <p className="gh__muted">
          No repos granted yet. Install the App{installUrl ? " via “Add a repo…”" : ""}, then Refresh.
        </p>
      ) : (
        <label className="gh__muted gh__field">
          Repo
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            {repos === null && <option value="">Loading…</option>}
            {(repos ?? []).map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}{r.private ? " (private)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="gh__error">{error}</p>}

      {repo && (
        <>
          <div className="gh__subhead">Projects</div>
          {projects === null && !error ? (
            <p className="gh__muted">Loading projects…</p>
          ) : projects && projects.length === 0 ? (
            <p className="gh__muted">No projects in this repo yet.</p>
          ) : (
            <ul className="gh__repo-list">
              {projects?.map((p) => {
                const localId = localBySlug[p.slug];
                return (
                  <li key={p.slug}>
                    <div className="gh__repo">
                      <span className="gh__repo-name">
                        {p.name}
                        {localId && <span className="gh__repo-tag">imported</span>}
                      </span>
                      {localId ? (
                        <button type="button" className="gh-acct__btn" onClick={() => onOpenProject?.(localId)}>
                          Open
                        </button>
                      ) : (
                        <button type="button" className="gh-acct__btn" disabled={busy !== null} onClick={() => void importProject(p.slug)}>
                          {busy === `p:${p.slug}` ? "Importing…" : "Import"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="gh__subhead">Courses</div>
          {courses === null && !error ? (
            <p className="gh__muted">Loading courses…</p>
          ) : courses && courses.length === 0 ? (
            <p className="gh__muted">No courses in this repo. Publish one from the Course Author.</p>
          ) : (
            <ul className="gh__repo-list">
              {courses?.map((c) => (
                <li key={c.slug}>
                  <div className="gh__repo">
                    <span className="gh__repo-name">{c.title}</span>
                    <button type="button" className="gh-acct__btn" disabled={busy !== null} onClick={() => void openCourse(c.slug)}>
                      {busy === `c:${c.slug}` ? "Opening…" : canPushRepo ? "Edit" : "Open"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Auto-sync controls (per device): toggle + idle-push delay. */
function AutoSyncSettings() {
  const [autoSync, setAutoSync] = useState(autoSyncEnabled());
  const [debounceSec, setDebounceSec] = useState(() => Math.round(autoSyncDebounceMs() / 1000));
  return (
    <div className="gh__repos">
      <div className="gh__repos-head">
        <span className="gh__repos-title">Auto-sync</span>
      </div>
      <label className="gh-push__amend">
        <input
          type="checkbox"
          checked={autoSync}
          onChange={(e) => { setAutoSync(e.target.checked); setAutoSyncEnabled(e.target.checked); }}
        />
        Auto-sync to GitHub (push on idle, pull on open)
      </label>
      <p className="gh__muted">Off by default. Turn it on per device — handy on a tablet where remembering to save is the hard part.</p>
      <label className="gh__muted gh__field">
        Push after
        <input
          type="number"
          min={2}
          step={1}
          value={debounceSec}
          disabled={!autoSync}
          onChange={(e) => {
            const sec = Math.max(2, Math.round(Number(e.target.value) || 0));
            setDebounceSec(sec);
            setAutoSyncDebounceMs(sec * 1000);
          }}
          style={{ width: 64 }}
        />
        seconds idle
      </label>
    </div>
  );
}
