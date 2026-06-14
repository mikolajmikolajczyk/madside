import { useMemo, useState } from "react";
import { createBlankProject, getCourse, getTemplateManifestText, installCourseFromGitHub, instantiateTemplate, listTemplates, openLesson, removeRemoteCourse } from "@app";
import { useCourses } from "../hooks/useCourses";
import { ManifestEditor } from "./manifest/ManifestEditor";
import "./Welcome.css";

interface Props {
  /** Called with the new project's id after a project is created. */
  onOpen: (projectId: string) => void;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** First-run / no-project view. Top: an empty project with the project.json
 *  properties editor + Create. Below: bundled-template cards. Picking either
 *  creates a project into storage and opens it. */
export function Welcome({ onOpen }: Props) {
  // Templates minus 'empty' (the empty flow is the top section).
  const templates = useMemo(() => listTemplates().filter((t) => t.id !== "empty"), []);
  const courses = useCourses();
  const [repoInput, setRepoInput] = useState("");
  const emptyFiles = useMemo(
    () => (listTemplates().find((t) => t.id === "empty")?.files ?? []).map((path) => ({ path })),
    [],
  );
  const [blankBytes, setBlankBytes] = useState<Uint8Array>(() => enc.encode(getTemplateManifestText("empty") ?? "{}\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createBlank = async () => {
    setBusy("blank");
    setError(null);
    try {
      const row = await createBlankProject(dec.decode(blankBytes));
      onOpen(row.id);
    } catch (e) {
      setError(`could not create project: ${String(e)}`);
      setBusy(null);
    }
  };

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const row = await instantiateTemplate(id);
      onOpen(row.id);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  // Selecting a course opens its first lesson in course mode.
  const pickCourse = async (id: string) => {
    setBusy(`course:${id}`);
    setError(null);
    try {
      const first = getCourse(id)?.lessons[0];
      if (!first) throw new Error(`course '${id}' has no lessons`);
      const projectId = await openLesson(id, first);
      onOpen(projectId);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  // Install a course from a public GitHub repo, then open its first lesson.
  const addCourse = async () => {
    const input = repoInput.trim();
    if (!input) return;
    setBusy("add-course");
    setError(null);
    try {
      const info = await installCourseFromGitHub(input);
      setRepoInput("");
      const first = info.lessons[0];
      if (!first) throw new Error("course has no lessons");
      const projectId = await openLesson(info.id, first);
      onOpen(projectId);
    } catch (e) {
      setError(`could not add course: ${String(e instanceof Error ? e.message : e)}`);
      setBusy(null);
    }
  };

  const removeCourse = async (id: string) => {
    setBusy(`remove:${id}`);
    setError(null);
    try {
      await removeRemoteCourse(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome__head">
        <h1 className="welcome__title">madside</h1>
        <p className="welcome__sub">Start a new project.</p>
        <p className="welcome__version">v{__APP_VERSION__} · alpha</p>
      </div>

      <section className="welcome__blank">
        <div className="welcome__section-title label">Empty project</div>
        <div className="welcome__manifest">
          <ManifestEditor value={blankBytes} onChange={setBlankBytes} files={emptyFiles} />
        </div>
        <button
          type="button"
          className="welcome__create"
          disabled={busy != null}
          onClick={() => void createBlank()}
          data-testid="welcome.create-blank"
        >
          {busy === "blank" ? "creating…" : "Create project"}
        </button>
      </section>

      <section className="welcome__templates">
        <div className="welcome__section-title label">Or start from a template</div>
        <div className="welcome__grid">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="welcome__card"
              disabled={busy != null}
              onClick={() => void pick(t.id)}
              data-testid={`welcome.template.${t.id}`}
            >
              <span className="welcome__card-head">
                <span className="welcome__card-name">{t.name}</span>
                <span className="welcome__card-machine label">{t.machine}</span>
              </span>
              <span className="welcome__card-desc">{t.description}</span>
              <ul className="welcome__card-files">
                {t.files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {busy === t.id && <span className="welcome__card-busy">creating…</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="welcome__templates">
        <div className="welcome__section-title label">Or follow a course</div>
        <div className="welcome__add-course">
          <input
            className="welcome__add-input"
            placeholder="Add a course from GitHub — github.com/owner/repo (or owner/repo@branch)"
            value={repoInput}
            disabled={busy != null}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addCourse(); }}
            data-testid="welcome.course-repo"
          />
          <button
            type="button"
            className="welcome__add-btn"
            disabled={busy != null || !repoInput.trim()}
            onClick={() => void addCourse()}
            data-testid="welcome.course-add"
          >
            {busy === "add-course" ? "adding…" : "Add"}
          </button>
        </div>
        {courses.length > 0 && (
          <div className="welcome__grid">
            {courses.map((c) => {
              const remote = c.source.kind === "github";
              return (
                <div key={c.id} className="welcome__card-wrap">
                  <button
                    type="button"
                    className="welcome__card"
                    disabled={busy != null}
                    onClick={() => void pickCourse(c.id)}
                    data-testid={`welcome.course.${c.id}`}
                  >
                    <span className="welcome__card-head">
                      <span className="welcome__card-name">{c.title}</span>
                      <span className="welcome__card-machine label">{c.machine}</span>
                    </span>
                    <span className="welcome__card-desc">{c.description}</span>
                    <span className="welcome__card-files">
                      {c.lessons.length} lessons
                      {c.source.kind === "github" && ` · ${c.source.owner}/${c.source.repo}`}
                    </span>
                    {busy === `course:${c.id}` && <span className="welcome__card-busy">opening…</span>}
                  </button>
                  {remote && (
                    <button
                      type="button"
                      className="welcome__card-remove"
                      title="Remove this course"
                      disabled={busy != null}
                      onClick={() => void removeCourse(c.id)}
                      data-testid={`welcome.course-remove.${c.id}`}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error && <div className="welcome__error">{error}</div>}
    </div>
  );
}
