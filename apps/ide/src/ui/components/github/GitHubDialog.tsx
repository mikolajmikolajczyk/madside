import { useEffect, useRef, useState } from "react";
import {
  useGitHub,
  githubConfig,
  listAccessibleRepos,
  appInstallUrl,
  repoRootHasOtherContent,
  listRemoteProjects,
  pullProjectToIdb,
  listRemoteCourses,
  pullCourseDraft,
  pushSettings,
  openLesson,
  loadThemeId,
  autoSyncEnabled,
  setAutoSyncEnabled,
  autoSyncDebounceMs,
  setAutoSyncDebounceMs,
  useWorkbench,
  type RepoRef,
  type RemoteProject,
  type RemoteCourse,
} from "@app";
import { useToast } from "../ui/Toast";
import "./GitHubDialog.css";

/** GitHub account panel (#159, #161). Optional sign-in via the gh-auth broker,
 *  pick the dedicated repo, and import projects from it. Gated on build-time
 *  config; this dialog is only reachable when `available` is true. `onOpenProject`
 *  opens an imported project. */
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
          <RepoPicker />
          {gh.repo && <RemoteProjects onOpenProject={onOpenProject} />}
          {gh.repo && <RemoteCourses onOpenProject={onOpenProject} />}
          {gh.repo && <SettingsSync />}
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
          Selected: <strong>{gh.repo}</strong>. Use File ▸ GitHub to push/pull.
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

/** Browse the projects already in the selected repo and import one into IDB. */
function RemoteProjects({ onOpenProject }: { onOpenProject?: (projectId: string) => void }) {
  const gh = useGitHub();
  const workbench = useWorkbench();
  const [projects, setProjects] = useState<RemoteProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!gh.auth || !gh.repo) return;
    const auth = gh.auth;
    const repo = gh.repo;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listRemoteProjects((url, init) => auth.fetch(url, init), repo);
        if (!cancelled) {
          setProjects(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gh.auth, gh.repo, refreshKey, gh.rev]);

  const importProject = async (slug: string) => {
    if (!gh.auth || !gh.repo) return;
    setBusy(slug);
    setError(null);
    try {
      const { projectId } = await pullProjectToIdb(
        workbench.storage,
        (url, init) => gh.auth!.fetch(url, init),
        gh.repo,
        slug,
      );
      if (mounted.current) setBusy(null);
      onOpenProject?.(projectId); // closes the dialog
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(null);
      }
    }
  };

  return (
    <div className="gh__repos">
      <div className="gh__repos-head">
        <span className="gh__repos-title">Import a project</span>
        <button type="button" className="gh__link gh__linkbtn" onClick={() => setRefreshKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <p className="gh__error">{error}</p>}
      {projects === null && !error ? (
        <p className="gh__muted">Loading projects…</p>
      ) : projects && projects.length === 0 ? (
        <p className="gh__muted">No projects in this repo yet — push one with “Save to GitHub”.</p>
      ) : (
        <ul className="gh__repo-list">
          {projects?.map((p) => (
            <li key={p.slug}>
              <div className="gh__repo">
                <span className="gh__repo-name">{p.name}</span>
                <button
                  type="button"
                  className="gh-acct__btn"
                  disabled={busy !== null}
                  onClick={() => void importProject(p.slug)}
                >
                  {busy === p.slug ? "Importing…" : "Import"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Browse courses in the repo and open one as an editable CourseAuthor draft. */
function RemoteCourses({ onOpenProject }: { onOpenProject?: (projectId: string) => void }) {
  const gh = useGitHub();
  const workbench = useWorkbench();
  const [courses, setCourses] = useState<RemoteCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!gh.auth || !gh.repo) return;
    const auth = gh.auth;
    const repo = gh.repo;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listRemoteCourses((url, init) => auth.fetch(url, init), repo);
        if (!cancelled) {
          setCourses(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [gh.auth, gh.repo, refreshKey, gh.rev]);

  const edit = async (slug: string) => {
    if (!gh.auth || !gh.repo) return;
    setBusy(slug);
    setError(null);
    try {
      const { courseId, lessonId } = await pullCourseDraft(
        workbench.storage,
        (url, init) => gh.auth!.fetch(url, init),
        gh.repo,
        slug,
      );
      const projectId = await openLesson(workbench.storage, courseId, lessonId);
      if (mounted.current) setBusy(null);
      onOpenProject?.(projectId);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(null);
      }
    }
  };

  return (
    <div className="gh__repos">
      <div className="gh__repos-head">
        <span className="gh__repos-title">Courses in repo</span>
        <button type="button" className="gh__link gh__linkbtn" onClick={() => setRefreshKey((k) => k + 1)}>
          Refresh
        </button>
      </div>
      {error && <p className="gh__error">{error}</p>}
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
                <button
                  type="button"
                  className="gh-acct__btn"
                  disabled={busy !== null}
                  onClick={() => void edit(c.slug)}
                >
                  {busy === c.slug ? "Opening…" : "Edit"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Save portable settings (theme) to the repo's settings.json. */
function SettingsSync() {
  const gh = useGitHub();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [autoSync, setAutoSync] = useState(autoSyncEnabled());
  const [debounceSec, setDebounceSec] = useState(() => Math.round(autoSyncDebounceMs() / 1000));
  const save = async () => {
    if (!gh.auth || !gh.repo) return;
    setBusy(true);
    try {
      await pushSettings((url, init) => gh.auth!.fetch(url, init), gh.repo, { theme: loadThemeId("dark") });
      toast.push("info", "Settings saved to GitHub");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gh__repos">
      <label className="gh-push__amend">
        <input
          type="checkbox"
          checked={autoSync}
          onChange={(e) => { setAutoSync(e.target.checked); setAutoSyncEnabled(e.target.checked); }}
        />
        Auto-sync to GitHub (push on idle, pull on open)
      </label>
      <p className="gh__muted">Off by default. Turn it on per device — handy on a tablet where remembering to save is the hard part.</p>
      <label className="gh__muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
      <button type="button" className="ui-dialog__btn" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save settings (theme) to GitHub"}
      </button>
    </div>
  );
}
