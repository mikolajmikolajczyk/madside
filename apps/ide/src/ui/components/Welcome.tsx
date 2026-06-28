import { useEffect, useMemo, useRef, useState } from "react";
import { unzipSync } from "fflate";
import { createBlankProject, createDraftCourse, getCourse, getTemplateManifestText, importDraftCourse, installCourseFromGitHub, instantiateTemplate, listTemplates, officialCourseRef, officialCourseSourceId, openLesson, removeRemoteCourse, starterFilesForMachine, useWorkbench, type OfficialCourse } from "@app";
import { errorMessage, NetworkError } from "@ports";
import { exportProjectZip } from "@app/project-zip";
import { useCourses } from "../hooks/useCourses";
import { useOfficialCourses } from "../hooks/useOfficialCourses";
import { useDisclosure } from "../hooks/useDisclosure";
import type { AnnotatedProject } from "../hooks/useProjectsWithCourse";
import { ManifestEditor } from "./manifest/ManifestEditor";
import { ConfirmDialog } from "./ui/Dialog";
import { GitHubAccountControls } from "./github/GitHubAccountControls";
import "./Welcome.css";

interface Props {
  /** Called with a project id to open (a freshly created one, or an existing). */
  onOpen: (projectId: string) => void;
  /** Existing projects in storage (annotated with course stamp) — split into
   *  "Your projects" + "Started courses" so course lessons don't clutter. */
  projects?: AnnotatedProject[];
  /** Delete a project by id (caller removes it from storage + refreshes the
   *  list). Welcome confirms first. */
  onDeleteProject?: (id: string) => Promise<void>;
  /** Open the GitHub dialog (repo picker). Present only when GitHub is
   *  configured for this build (#159). */
  onManageGitHub?: () => void;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const REPO_URL = "https://github.com/mikolajmikolajczyk/madside";

// Machine filter shows chips up to this many machines, a dropdown beyond.
const CHIP_LIMIT = 5;

/** Case-insensitive substring match against any field; empty query matches all. */
function hay(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || fields.some((f) => f.toLowerCase().includes(q));
}

/** Coarse "opened N ago" label for a project's last-touched timestamp. */
function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo > 1 ? "s" : ""} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}

// SVG glyphs for the per-card hover actions (download / delete).
const ICON_DOWNLOAD = "M12 3v12m0 0l-4-4m4 4l4-4M5 21h14";
const ICON_DELETE = "M4 7h16M9 7V4h6v3m-7 0v13h8V7";

/** Search box + per-machine filter chips, shared by the template + course
 *  sections. Chips appear only when there's more than one machine to pick. */
function CardFilter({ query, onQuery, machines, machine, onMachine, placeholder, testid }: {
  query: string;
  onQuery: (v: string) => void;
  machines: string[];
  machine: string | null;
  onMachine: (m: string | null) => void;
  placeholder: string;
  testid: string;
}) {
  return (
    <div className="welcome__filter">
      <input
        className="welcome__search"
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        data-testid={`${testid}.search`}
      />
      {machines.length > 1 && (
        // Chips read well for a handful of machines; past that they'd wrap into
        // a cluttered grid, so fall back to a compact dropdown.
        machines.length <= CHIP_LIMIT ? (
          <div className="welcome__chips" role="group" aria-label="Filter by machine">
            <button type="button" className={"welcome__chip" + (machine === null ? " welcome__chip--on" : "")} onClick={() => onMachine(null)} data-testid={`${testid}.all`}>All</button>
            {machines.map((m) => (
              <button key={m} type="button" className={"welcome__chip" + (machine === m ? " welcome__chip--on" : "")} onClick={() => onMachine(m)} data-testid={`${testid}.${m}`}>{m}</button>
            ))}
          </div>
        ) : (
          <select
            className="welcome__machine-select"
            value={machine ?? ""}
            onChange={(e) => onMachine(e.target.value || null)}
            aria-label="Filter by machine"
            data-testid={`${testid}.select`}
          >
            <option value="">All machines</option>
            {machines.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )
      )}
    </div>
  );
}

/** First-run / no-project view. Top: an empty project with the project.json
 *  properties editor + Create. Below: bundled-template cards. Picking either
 *  creates a project into storage and opens it. */
export function Welcome({ onOpen, projects = [], onDeleteProject, onManageGitHub }: Props) {
  const workbench = useWorkbench();
  // Templates minus 'empty' (the empty flow is the top section).
  const templates = useMemo(() => listTemplates().filter((t) => t.id !== "empty"), []);
  const courses = useCourses();
  const officialCourses = useOfficialCourses();
  // Official courses the learner hasn't installed yet — shown by default so a
  // fresh visit surfaces them without a manual GitHub add.
  const featured = useMemo(() => {
    const installed = new Set(courses.map((c) => c.id));
    return officialCourses.filter((o) => !installed.has(officialCourseSourceId(o)));
  }, [officialCourses, courses]);
  const [repoInput, setRepoInput] = useState("");
  const emptyFiles = useMemo(
    () => (listTemplates().find((t) => t.id === "empty")?.files ?? []).map((path) => ({ path })),
    [],
  );
  const [blankBytes, setBlankBytes] = useState<Uint8Array>(() => enc.encode(getTemplateManifestText("empty") ?? "{}\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Holds one or more project ids to delete (a course group deletes every lesson).
  const [confirmDelete, setConfirmDelete] = useState<{ name: string; ids: string[] } | null>(null);

  // Split course-lesson projects (manifest.course) out of plain projects so they
  // get their own "Started courses" section instead of cluttering "Your projects".
  const plainProjects = useMemo(() => projects.filter((p) => !p.course), [projects]);
  // Group course-lesson projects by course so a learner sees ONE entry per
  // started course (not one per lesson visited); resume opens the latest lesson.
  const startedCourseGroups = useMemo(() => {
    const byId = new Map<string, AnnotatedProject[]>();
    for (const p of projects) {
      if (!p.course) continue;
      const list = byId.get(p.course.id) ?? [];
      list.push(p);
      byId.set(p.course.id, list);
    }
    return [...byId.entries()]
      .map(([courseId, projs]) => {
        const sorted = [...projs].sort((a, b) => b.updatedAt - a.updatedAt);
        const latest = sorted[0]!;
        const lessons = getCourse(courseId)?.lessons ?? [];
        // 1-based position of the last-opened lesson in the course order (0 if
        // the course/lesson is no longer known).
        const pos = lessons.indexOf(latest.course!.lesson) + 1;
        return { courseId, title: getCourse(courseId)?.title ?? courseId, projects: sorted, latest, pos, total: lessons.length };
      })
      .sort((a, b) => b.latest.updatedAt - a.latest.updatedAt);
  }, [projects]);

  // Progressive disclosure: existing projects + the empty/template flows collapse;
  // templates + courses are narrowed by search + a per-machine filter.
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const projectsD = useDisclosure(plainProjects, 6);
  const startedD = useDisclosure(startedCourseGroups, 6);
  // Two-column layout: left = your projects + started courses, right = start-new.
  // First run (nothing on the left) collapses to a single centred column.
  const hasLeft = plainProjects.length > 0 || startedCourseGroups.length > 0;

  const [tplQuery, setTplQuery] = useState("");
  const [tplMachine, setTplMachine] = useState<string | null>(null);
  const [courseQuery, setCourseQuery] = useState("");
  const [courseMachine, setCourseMachine] = useState<string | null>(null);

  const tplMachines = useMemo(() => [...new Set(templates.map((t) => t.machine))].sort(), [templates]);
  const filteredTemplates = useMemo(
    () => templates.filter((t) => (!tplMachine || t.machine === tplMachine) && hay(tplQuery, t.name, t.description, t.machine)),
    [templates, tplQuery, tplMachine],
  );

  const courseMachines = useMemo(
    () => [...new Set([...featured.map((c) => c.machine), ...courses.map((c) => c.machine)])].sort(),
    [featured, courses],
  );
  const filteredFeatured = useMemo(
    () => featured.filter((c) => (!courseMachine || c.machine === courseMachine) && hay(courseQuery, c.title, c.description, c.machine)),
    [featured, courseQuery, courseMachine],
  );
  const filteredCourses = useMemo(
    () => courses.filter((c) => (!courseMachine || c.machine === courseMachine) && hay(courseQuery, c.title, c.description, c.machine)),
    [courses, courseQuery, courseMachine],
  );
  // Same "show 6 then more" cap as Your projects, applied per course list.
  const featuredD = useDisclosure(filteredFeatured, 6);
  const installedD = useDisclosure(filteredCourses, 6);

  const createBlank = async () => {
    setBusy("blank");
    setError(null);
    try {
      const row = await createBlankProject(workbench.storage, dec.decode(blankBytes));
      onOpen(row.id);
    } catch (e) {
      setError(`could not create project: ${errorMessage(e)}`);
      setBusy(null);
    }
  };

  const createCourse = async () => {
    setBusy("course");
    setError(null);
    try {
      const { courseId, lessonId } = await createDraftCourse(workbench.storage, { starter: starterFilesForMachine });
      onOpen(await openLesson(workbench.storage, courseId, lessonId));
    } catch (e) {
      setError(`could not create course: ${errorMessage(e)}`);
      setBusy(null);
    }
  };

  // Import an existing course into authoring (round-trips with Export). A folder
  // picker is preferred; a .zip is the fallback. Both rebase onto the course
  // root (course.json) and wrap with a container project.json (#139).
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  useEffect(() => { folderRef.current?.setAttribute("webkitdirectory", ""); }, []);

  const importFiles = async (files: { path: string; content: string }[]) => {
    setBusy("import");
    setError(null);
    try {
      const { courseId, lessonId } = await importDraftCourse(workbench.storage, files);
      onOpen(await openLesson(workbench.storage, courseId, lessonId));
    } catch (e) {
      setError(`could not import course: ${errorMessage(e)}`);
      setBusy(null);
    }
  };
  const onPickFolder = async (list: FileList) => {
    const files = await Promise.all(
      [...list].map(async (f) => ({ path: f.webkitRelativePath || f.name, content: await f.text() })),
    );
    await importFiles(files);
  };
  const onPickZip = async (file: File) => {
    const raw = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const dec2 = new TextDecoder();
    const files = Object.entries(raw)
      .filter(([n]) => !n.endsWith("/"))
      .map(([path, bytes]) => ({ path: path.replace(/^\/+/, ""), content: dec2.decode(bytes) }));
    await importFiles(files);
  };

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const row = await instantiateTemplate(workbench.storage, id);
      onOpen(row.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  // Download a project as a ZIP (same shape as File → Export ZIP).
  const exportProject = async (id: string) => {
    setBusy(`export:${id}`);
    setError(null);
    try {
      const bytes = await exportProjectZip(workbench.storage, id);
      const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`could not export: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // Delete (after the confirm dialog) — one project, or every lesson of a course.
  const doDeleteProject = async () => {
    if (!confirmDelete || !onDeleteProject) return;
    const { ids } = confirmDelete;
    setConfirmDelete(null);
    setBusy(`delete:${ids[0]}`);
    setError(null);
    try {
      for (const id of ids) await onDeleteProject(id);
    } catch (e) {
      setError(`could not delete: ${errorMessage(e)}`);
    } finally {
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
      const projectId = await openLesson(workbench.storage, id, first);
      onOpen(projectId);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  // Open an official (catalogue) course: install it from its ref, then open
  // its first lesson — same path as a manual add, just pre-filled.
  const pickOfficial = async (c: OfficialCourse) => {
    setBusy(`official:${c.id}`);
    setError(null);
    try {
      const [info] = await installCourseFromGitHub(workbench.storage, officialCourseRef(c));
      const first = info?.lessons[0];
      if (!info || !first) throw new Error("course has no lessons");
      const projectId = await openLesson(workbench.storage, info.id, first);
      onOpen(projectId);
    } catch (e) {
      const detail = e instanceof NetworkError
        ? "couldn't reach GitHub/jsDelivr — check your connection"
        : errorMessage(e);
      setError(`could not open course: ${detail}`);
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
      const infos = await installCourseFromGitHub(workbench.storage, input);
      setRepoInput("");
      // A repo can hold several courses. Auto-open only when there's exactly one;
      // otherwise stay on Welcome so the user sees all of them in the list.
      if (infos.length === 1) {
        const first = infos[0]!.lessons[0];
        if (first) {
          const projectId = await openLesson(workbench.storage, infos[0]!.id, first);
          onOpen(projectId);
          return;
        }
      }
      setBusy(null);
    } catch (e) {
      // Branch on the typed error: a network failure is the repo/CDN being
      // unreachable, not a bad course — give the user the right hint.
      const detail = e instanceof NetworkError
        ? "couldn't reach GitHub/jsDelivr — check the repo and your connection"
        : errorMessage(e);
      setError(`could not add course: ${detail}`);
      setBusy(null);
    }
  };

  const removeCourse = async (id: string) => {
    setBusy(`remove:${id}`);
    setError(null);
    try {
      await removeRemoteCourse(workbench.storage, id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // A project card with open / export / delete, shared by "Your projects" and
  // "Started courses" (an optional subline names the course + lesson).
  const renderProjectCard = (p: AnnotatedProject, subline?: string) => (
    <div key={p.id} className="welcome__card-wrap">
      <button
        type="button"
        className="welcome__card welcome__card--project"
        disabled={busy != null}
        onClick={() => { setBusy(`open:${p.id}`); onOpen(p.id); }}
        data-testid={`welcome.project.${p.id}`}
      >
        <span className="welcome__card-head">
          <span className="welcome__card-name">{p.name}</span>
          {p.machine && <span className="welcome__card-machine label">{p.machine}</span>}
        </span>
        {(p.toolchain || p.main) && (
          <span className="welcome__card-meta">
            {p.toolchain && <span><span className="welcome__meta-k">toolchain</span> {p.toolchain}</span>}
            {p.main && <span><span className="welcome__meta-k">main</span> {p.main}</span>}
          </span>
        )}
        {subline && <span className="welcome__card-files">{subline}</span>}
        <span className="welcome__card-opened">
          {busy === `open:${p.id}` ? "opening…"
            : busy === `export:${p.id}` ? "exporting…"
            : busy === `delete:${p.id}` ? "deleting…"
            : `opened ${timeAgo(p.updatedAt)}`}
        </span>
      </button>
      <div className="welcome__card-actions">
        <button
          type="button"
          className="welcome__iconbtn"
          title="Export as ZIP"
          aria-label="Export as ZIP"
          disabled={busy != null}
          onClick={() => void exportProject(p.id)}
          data-testid={`welcome.project-export.${p.id}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden><path d={ICON_DOWNLOAD} /></svg>
        </button>
        {onDeleteProject && (
          <button
            type="button"
            className="welcome__iconbtn welcome__iconbtn--danger"
            title="Delete project"
            aria-label="Delete project"
            disabled={busy != null}
            onClick={() => setConfirmDelete({ name: p.name, ids: [p.id] })}
            data-testid={`welcome.project-delete.${p.id}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden><path d={ICON_DELETE} /></svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome__head">
        <div className="welcome__head-top">
          <div className="welcome__hero">
            <h1 className="welcome__title">madside<span className="welcome__title-dot" aria-hidden>_</span></h1>
            <span className="welcome__version">v{__APP_VERSION__} · alpha</span>
          </div>
          <GitHubAccountControls onManage={onManageGitHub} />
        </div>
        <p className="welcome__sub">A browser IDE for retro machines. Open a project to pick up where you left off, or start something new.</p>
      </div>

      <div className={"welcome__cols" + (hasLeft ? "" : " welcome__cols--single")}>
        {hasLeft && (
          <div className="welcome__col welcome__col--left">

      {plainProjects.length > 0 && (
        <section className="welcome__templates">
          <div className="welcome__section-title label">Your projects <span className="welcome__section-count">· {plainProjects.length}</span></div>
          <div className="welcome__grid">
            {projectsD.visible.map((p) => renderProjectCard(p))}
          </div>
          {projectsD.hasMore && (
            <button type="button" className="welcome__more" onClick={projectsD.toggle} data-testid="welcome.projects-more">
              {projectsD.expanded ? "Show less" : `More (${projectsD.hiddenCount})`}
            </button>
          )}
        </section>
      )}

      {startedCourseGroups.length > 0 && (
        <section className="welcome__templates">
          <div className="welcome__section-title label">Started courses <span className="welcome__section-count">· {startedCourseGroups.length}</span></div>
          <div className="welcome__grid">
            {startedD.visible.map((g) => (
              <div key={g.courseId} className="welcome__card-wrap">
                <button
                  type="button"
                  className="welcome__card"
                  disabled={busy != null}
                  onClick={() => { setBusy(`open:${g.latest.id}`); onOpen(g.latest.id); }}
                  data-testid={`welcome.started-course.${g.courseId}`}
                >
                  <span className="welcome__card-head">
                    <span className="welcome__card-name">{g.title}</span>
                  </span>
                  <span className="welcome__card-desc">
                    {g.pos > 0 ? `Continue — lesson ${g.pos} of ${g.total}` : "Continue where you left off"}
                  </span>
                  <span className="welcome__card-files">{g.latest.course!.lesson}</span>
                  {busy === `open:${g.latest.id}` && <span className="welcome__card-busy">opening…</span>}
                  {busy === `delete:${g.projects[0]!.id}` && <span className="welcome__card-busy">removing…</span>}
                </button>
                {onDeleteProject && (
                  <div className="welcome__card-actions">
                    <button
                      type="button"
                      className="welcome__iconbtn welcome__iconbtn--danger"
                      title="Remove course progress (all lessons)"
                      aria-label="Remove course progress"
                      disabled={busy != null}
                      onClick={() => setConfirmDelete({ name: g.title, ids: g.projects.map((p) => p.id) })}
                      data-testid={`welcome.started-course-delete.${g.courseId}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden><path d={ICON_DELETE} /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {startedD.hasMore && (
            <button type="button" className="welcome__more" onClick={startedD.toggle} data-testid="welcome.started-courses-more">
              {startedD.expanded ? "Show less" : `More (${startedD.hiddenCount})`}
            </button>
          )}
        </section>
      )}

          </div>
        )}

        <div className="welcome__col welcome__col--right">

      <div className="welcome__section-title label welcome__start-label">Start something new</div>

      <section className="welcome__blank">
        <button
          type="button"
          className={"welcome__disclosure" + (emptyOpen ? " welcome__disclosure--open" : "")}
          aria-expanded={emptyOpen}
          onClick={() => setEmptyOpen((o) => !o)}
          data-testid="welcome.empty-toggle"
        >
          <span className="welcome__disclosure-plus" aria-hidden>+</span>
          <span className="welcome__disclosure-label">New empty project</span>
          <span className="welcome__disclosure-hint">configure project.json yourself</span>
          <span className="welcome__chevron" aria-hidden>▸</span>
        </button>
        {emptyOpen && (
          <div className="welcome__collapse-body">
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
          </div>
        )}
      </section>

      <section className="welcome__blank">
        <button
          type="button"
          className={"welcome__disclosure" + (templatesOpen ? " welcome__disclosure--open" : "")}
          aria-expanded={templatesOpen}
          onClick={() => setTemplatesOpen((o) => !o)}
          data-testid="welcome.templates-toggle"
        >
          <span className="welcome__disclosure-plus" aria-hidden>+</span>
          <span className="welcome__disclosure-label">Start from a template</span>
          <span className="welcome__disclosure-hint">a ready-made project to build on</span>
          <span className="welcome__chevron" aria-hidden>▸</span>
        </button>
        {templatesOpen && (
          <div className="welcome__collapse-body">
            <CardFilter
              query={tplQuery}
              onQuery={setTplQuery}
              machines={tplMachines}
              machine={tplMachine}
              onMachine={setTplMachine}
              placeholder="Search templates…"
              testid="welcome.template-filter"
            />
            <div className="welcome__grid">
              {filteredTemplates.map((t) => (
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
            {filteredTemplates.length === 0 && <div className="welcome__empty-hint">No templates match.</div>}
          </div>
        )}
      </section>

      <section className="welcome__blank">
        <button
          type="button"
          className={"welcome__disclosure" + (coursesOpen ? " welcome__disclosure--open" : "")}
          aria-expanded={coursesOpen}
          onClick={() => setCoursesOpen((o) => !o)}
          data-testid="welcome.courses-toggle"
        >
          <span className="welcome__disclosure-plus" aria-hidden>+</span>
          <span className="welcome__disclosure-label">Follow a course</span>
          <span className="welcome__disclosure-hint">guided, interactive lessons</span>
          <span className="welcome__chevron" aria-hidden>▸</span>
        </button>
        {coursesOpen && (
          <div className="welcome__collapse-body">
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
            <button
              type="button"
              className="welcome__create"
              disabled={busy != null}
              onClick={() => void createCourse()}
              data-testid="welcome.course-new"
            >
              {busy === "course" ? "creating…" : "Author a new course"}
            </button>
            <div className="welcome__course-import">
              <span className="welcome__course-import-label">Edit an existing course:</span>
              <button type="button" className="welcome__add-btn" disabled={busy != null} onClick={() => folderRef.current?.click()} data-testid="welcome.course-import-folder">
                {busy === "import" ? "importing…" : "Import folder"}
              </button>
              <button type="button" className="welcome__add-btn" disabled={busy != null} onClick={() => zipRef.current?.click()} data-testid="welcome.course-import-zip">
                Import .zip
              </button>
              <input ref={folderRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void onPickFolder(e.target.files); e.target.value = ""; }} />
              <input ref={zipRef} type="file" accept=".zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickZip(f); e.target.value = ""; }} />
            </div>
        {(featured.length > 0 || courses.length > 0) && (
          <CardFilter
            query={courseQuery}
            onQuery={setCourseQuery}
            machines={courseMachines}
            machine={courseMachine}
            onMachine={setCourseMachine}
            placeholder="Search courses…"
            testid="welcome.course-filter"
          />
        )}
        {filteredFeatured.length > 0 && (
          <div className="welcome__grid">
            {featuredD.visible.map((c) => (
              <div key={c.id} className="welcome__card-wrap">
                <button
                  type="button"
                  className="welcome__card"
                  disabled={busy != null}
                  onClick={() => void pickOfficial(c)}
                  data-testid={`welcome.official.${c.id}`}
                >
                  <span className="welcome__card-head">
                    <span className="welcome__card-name">{c.title}</span>
                    <span className="welcome__card-machine label">{c.machine}</span>
                  </span>
                  <span className="welcome__card-desc">{c.description}</span>
                  <span className="welcome__card-files">official · madside-courses</span>
                  {busy === `official:${c.id}` && <span className="welcome__card-busy">opening…</span>}
                </button>
              </div>
            ))}
          </div>
        )}
        {featuredD.hasMore && (
          <button type="button" className="welcome__more" onClick={featuredD.toggle} data-testid="welcome.featured-more">
            {featuredD.expanded ? "Show less" : `More (${featuredD.hiddenCount})`}
          </button>
        )}
        {filteredCourses.length > 0 && (
          <div className="welcome__grid">
            {installedD.visible.map((c) => {
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
        {installedD.hasMore && (
          <button type="button" className="welcome__more" onClick={installedD.toggle} data-testid="welcome.courses-more">
            {installedD.expanded ? "Show less" : `More (${installedD.hiddenCount})`}
          </button>
        )}
            {(featured.length > 0 || courses.length > 0) && filteredFeatured.length === 0 && filteredCourses.length === 0 && (
              <div className="welcome__empty-hint">No courses match.</div>
            )}
          </div>
        )}
      </section>

        </div>
      </div>

      {error && <div className="welcome__error">{error}</div>}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete ? `Delete "${confirmDelete.name}"?` : ""}
        description={
          confirmDelete && confirmDelete.ids.length > 1
            ? `This removes all ${confirmDelete.ids.length} started lessons of this course from this browser. The course itself stays available to restart.`
            : "This permanently removes the project and its history from this browser. Export a ZIP first if you want to keep it."
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void doDeleteProject()}
      />

      <footer className="welcome__footer">
        <a className="welcome__footer-link" href="/docs/">Documentation</a>
        <a className="welcome__footer-link" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        <a className="welcome__footer-link" href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">Report an issue</a>
      </footer>
    </div>
  );
}
