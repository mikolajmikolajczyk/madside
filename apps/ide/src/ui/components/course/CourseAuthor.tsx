import { useEffect, useRef, useState } from "react";
import {
  AUTHORABLE_MACHINES,
  courseExportFiles,
  courseMetaText,
  deleteLessonInFiles,
  listLessons,
  readCourseMeta,
  readLessonChecks,
  setCourseMetaInFiles,
  setLessonChecksInFiles,
  setLessonMdInFiles,
  slugify,
  swapLessonsInFiles,
  useGitHub,
  publishCourseToGitHub,
  validateCourseFiles,
  zipCourse,
} from "@app";
import type { CourseCheck, CourseMeta, LessonInfo } from "@app";
import { useToast } from "../ui/Toast";
import "./CourseAuthor.css";

type Files = { path: string; content: string }[];

function downloadCourse(files: Files, title: string): void {
  const check = validateCourseFiles(courseExportFiles(files));
  if (!check.ok) {
    window.alert(`Course not ready to export: ${check.error}`);
    return;
  }
  const blob = new Blob([zipCourse(files) as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title) || "course"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// Course Author surface (#139). The course is a draft bundle; this is its editor.
// Every edit is a pure transform over the bundle files → onSaveFiles. The ACTIVE
// lesson (open in the file tree as a normal project) is highlighted + expanded for
// markdown/check editing; clicking another lesson selects it (the host saves the
// open lesson back + opens the new one).

const EMPTY: CourseMeta = { title: "", description: "", machine: AUTHORABLE_MACHINES[0]! };

export function CourseAuthor({ files, activeLessonId, onSaveFiles, onSelectLesson, onAddLesson }: {
  files: Files;
  activeLessonId: string | null;
  onSaveFiles: (files: Files) => void;
  onSelectLesson: (lessonId: string) => void;
  onAddLesson: () => void;
}) {
  const meta = readCourseMeta(files) ?? EMPTY;
  const lessons = listLessons(files);
  const gh = useGitHub();
  const toast = useToast();

  // Publish the course to the user's repo under courses/<slug>/ (#165).
  const publish = async () => {
    if (!gh.auth || !gh.repo) return;
    const check = validateCourseFiles(courseExportFiles(files));
    if (!check.ok) {
      toast.error(new Error(`Course not ready: ${check.error}`));
      return;
    }
    const slug = slugify(meta.title) || "course";
    const enc = new TextEncoder();
    const syncFiles = courseExportFiles(files).map((f) => ({ path: f.path, content: enc.encode(f.content) }));
    const auth = gh.auth;
    try {
      await publishCourseToGitHub((url, init) => auth.fetch(url, init), gh.repo, slug, syncFiles, `Publish course "${meta.title}"`);
      toast.push("info", `Published “${meta.title}” to ${gh.repo}/courses/${slug}`);
      gh.refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="course-author">
      <div className="course-author__title label">
        <span>Course Author</span>
        <button
          type="button"
          className="course-author__btn"
          onClick={() => downloadCourse(files, meta.title)}
          title="Validate + download the course as a .zip (push it to a public GitHub repo to publish)"
        >
          ↓ Export .zip
        </button>
        {gh.available && gh.signedIn && gh.repo && (
          <button
            type="button"
            className="course-author__btn"
            onClick={() => void publish()}
            title="Publish this course to your GitHub repo under courses/<slug>/"
          >
            ↑ Publish to GitHub
          </button>
        )}
      </div>
      <MetaForm meta={meta} onSave={(m) => onSaveFiles(setCourseMetaInFiles(files, m))} />

      <div className="course-author__section">
        <div className="course-author__section-head">
          <span>Lessons</span>
          <button type="button" className="course-author__btn" onClick={onAddLesson} title="Add a lesson">
            + Add lesson
          </button>
        </div>

        {lessons.length === 0 ? (
          <div className="course-author__empty">No lessons yet — add one.</div>
        ) : (
          <ul className="course-author__lessons">
            {lessons.map((l, i) => (
              <LessonRow
                key={l.id}
                lesson={l}
                files={files}
                active={l.id === activeLessonId}
                canUp={i > 0}
                canDown={i < lessons.length - 1}
                onSelect={() => onSelectLesson(l.id)}
                onUp={() => onSaveFiles(swapLessonsInFiles(files, lessons[i - 1]!.id, l.id))}
                onDown={() => onSaveFiles(swapLessonsInFiles(files, l.id, lessons[i + 1]!.id))}
                onDelete={() => {
                  if (window.confirm(`Delete lesson "${l.title}"? This cannot be undone.`)) {
                    onSaveFiles(deleteLessonInFiles(files, l.id));
                  }
                }}
                onSaveMd={(text) => onSaveFiles(setLessonMdInFiles(files, l.id, text))}
                onSaveChecks={(checks) => onSaveFiles(setLessonChecksInFiles(files, l.id, checks))}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="course-author__hint">
        Click a lesson to open it in the file tree (a normal project — build &amp; run it). Edit its text + checks here. <strong>Course Preview</strong> shows it as a learner sees it; <strong>Export .zip</strong> to publish.
      </p>
    </div>
  );
}

// ── Metadata form (course.json) ──────────────────────────────────────────────
function MetaForm({ meta, onSave }: { meta: CourseMeta; onSave: (m: CourseMeta) => void }) {
  const [draft, setDraft] = useState<CourseMeta>(meta);
  const lastText = useRef(courseMetaText(meta));

  // Re-seed when course.json changes underneath us (not our own write).
  useEffect(() => {
    const text = courseMetaText(meta);
    if (text !== lastText.current) {
      setDraft(meta);
      lastText.current = text;
    }
  }, [meta]);

  const persist = (next: CourseMeta) => {
    const text = courseMetaText(next);
    if (text === lastText.current) return;
    lastText.current = text;
    onSave(next);
  };

  return (
    <div className="course-author__form">
      <label className="course-author__field">
        <span>Title</span>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => persist(draft)} placeholder="My course" spellCheck={false} />
      </label>
      <label className="course-author__field">
        <span>Description</span>
        <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => persist(draft)} placeholder="One-line summary shown in the picker." rows={2} spellCheck={false} />
      </label>
      <label className="course-author__field">
        <span>Machine</span>
        <select value={draft.machine} onChange={(e) => { const next = { ...draft, machine: e.target.value }; setDraft(next); persist(next); }}>
          {AUTHORABLE_MACHINES.map((m) => <option key={m} value={m}>{m}</option>)}
          {!AUTHORABLE_MACHINES.includes(draft.machine) && <option value={draft.machine}>{draft.machine}</option>}
        </select>
      </label>
      <label className="course-author__field">
        <span>Order <small>(optional sort hint)</small></span>
        <input type="number" value={draft.order ?? ""} onChange={(e) => { const v = e.target.value.trim(); setDraft({ ...draft, order: v === "" ? undefined : Number(v) }); }} onBlur={() => persist(draft)} placeholder="—" />
      </label>
    </div>
  );
}

// ── One lesson row — click to open (active = expanded for md + check editing) ──
function LessonRow({ lesson, files, active, canUp, canDown, onSelect, onUp, onDown, onDelete, onSaveMd, onSaveChecks }: {
  lesson: LessonInfo;
  files: Files;
  active: boolean;
  canUp: boolean;
  canDown: boolean;
  onSelect: () => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onSaveMd: (text: string) => void;
  onSaveChecks: (checks: CourseCheck[]) => void;
}) {
  const mdContent = files.find((f) => f.path === `lessons/${lesson.id}/lesson.md`)?.content ?? "";
  const checks = readLessonChecks(files, lesson.id);

  return (
    <li className="course-author__lesson">
      <div className={"course-author__lesson-head" + (active ? " course-author__lesson-head--open" : "")}>
        <button
          type="button"
          className="course-author__lesson-toggle"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          title="Open this lesson in the file tree"
        >
          <span className="course-author__caret">{active ? "▾" : "▸"}</span>
          <span className="course-author__lesson-n">{String(lesson.n).padStart(2, "0")}</span>
          <span className="course-author__lesson-title" title={lesson.dir}>{lesson.title}</span>
        </button>
        <button type="button" className="course-author__icon" disabled={!canUp} onClick={onUp} title="Move up">↑</button>
        <button type="button" className="course-author__icon" disabled={!canDown} onClick={onDown} title="Move down">↓</button>
        <button type="button" className="course-author__icon course-author__icon--del" onClick={onDelete} title="Delete lesson">✕</button>
      </div>
      {active && (
        <div className="course-author__lesson-body">
          <LessonMd key={`${lesson.id}-md`} initial={mdContent} onSave={onSaveMd} />
          <LessonChecks key={`${lesson.id}-checks`} initial={checks} onSave={onSaveChecks} />
        </div>
      )}
    </li>
  );
}

// ── Check builder (#139 phase 3) — author a lesson's check.json via forms ─────
const CHECK_KINDS = ["build", "label", "memory", "register"] as const;

function defaultCheck(kind: CourseCheck["kind"]): CourseCheck {
  switch (kind) {
    case "build": return { kind: "build" };
    case "label": return { kind: "label", name: "" };
    case "memory": return { kind: "memory", addr: "$0000", equals: "$00" };
    case "register": return { kind: "register", reg: "a", equals: "$00" };
  }
}

function LessonChecks({ initial, onSave }: { initial: CourseCheck[]; onSave: (checks: CourseCheck[]) => void }) {
  const [checks, setChecks] = useState(initial);

  // Re-seed when check.json changes underneath us (during-render reset).
  const initialKey = JSON.stringify(initial);
  const [seenKey, setSeenKey] = useState(initialKey);
  if (initialKey !== seenKey) { setSeenKey(initialKey); setChecks(initial); }

  // persist reads the render-scope `checks`; onBlur fires after the edit's
  // re-render, so the handler closes over the latest array (no ref needed).
  const persist = () => onSave(checks);
  // Replace check i (save=true persists now — discrete edits: add/remove/select;
  // text edits pass save=false and persist on blur).
  const replaceAt = (i: number, next: CourseCheck, save: boolean) => {
    const arr = checks.map((c, j) => (j === i ? next : c));
    setChecks(arr);
    if (save) onSave(arr);
  };
  const commit = (arr: CourseCheck[]) => { setChecks(arr); onSave(arr); };

  return (
    <div className="course-author__checks">
      <div className="course-author__checks-head">
        <span>Checks</span>
        <select
          className="course-author__check-add"
          value=""
          onChange={(e) => { const k = e.target.value as CourseCheck["kind"]; if (k) commit([...checks, defaultCheck(k)]); }}
        >
          <option value="">+ add check…</option>
          {CHECK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {checks.length === 0 ? (
        <div className="course-author__empty">No checks — add one to verify the learner's work.</div>
      ) : (
        checks.map((c, i) => (
          <div className="course-author__check" key={i}>
            <span className="course-author__check-kind">{c.kind}</span>
            <CheckFields
              check={c}
              replace={(next, save) => replaceAt(i, next, save)}
              persist={persist}
            />
            <button type="button" className="course-author__icon course-author__icon--del" onClick={() => commit(checks.filter((_, j) => j !== i))} title="Remove check">✕</button>
          </div>
        ))
      )}
    </div>
  );
}

function CheckFields({ check, replace, persist }: {
  check: CourseCheck;
  replace: (next: CourseCheck, save: boolean) => void;
  persist: () => void;
}) {
  switch (check.kind) {
    case "build":
      return <span className="course-author__check-note">passes if the project assembles</span>;
    case "label":
      return (
        <>
          <input className="course-author__check-in" placeholder="label name" value={check.name} onChange={(e) => replace({ ...check, name: e.target.value }, false)} onBlur={persist} spellCheck={false} />
          <input className="course-author__check-in" placeholder="addr (opt, $hex)" value={check.addr ?? ""} onChange={(e) => replace({ ...check, addr: e.target.value || undefined }, false)} onBlur={persist} spellCheck={false} />
        </>
      );
    case "memory":
      return (
        <>
          <input className="course-author__check-in" placeholder="addr $hex" value={check.addr} onChange={(e) => replace({ ...check, addr: e.target.value }, false)} onBlur={persist} spellCheck={false} />
          <input className="course-author__check-in" placeholder="equals $hex" value={check.equals} onChange={(e) => replace({ ...check, equals: e.target.value }, false)} onBlur={persist} spellCheck={false} />
          <input className="course-author__check-in" placeholder="space (opt)" value={check.space ?? ""} onChange={(e) => replace({ ...check, space: e.target.value || undefined }, false)} onBlur={persist} spellCheck={false} />
          <input className="course-author__check-in" type="number" placeholder="afterFrames" value={check.afterFrames ?? ""} onChange={(e) => replace({ ...check, afterFrames: e.target.value === "" ? undefined : Number(e.target.value) }, false)} onBlur={persist} />
        </>
      );
    case "register":
      return (
        <>
          <select className="course-author__check-in" value={check.reg} onChange={(e) => replace({ ...check, reg: e.target.value as typeof check.reg }, true)}>
            {(["a", "x", "y", "sp", "pc"] as const).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="course-author__check-in" placeholder="equals $hex" value={check.equals} onChange={(e) => replace({ ...check, equals: e.target.value }, false)} onBlur={persist} spellCheck={false} />
          <input className="course-author__check-in" type="number" placeholder="afterFrames" value={check.afterFrames ?? ""} onChange={(e) => replace({ ...check, afterFrames: e.target.value === "" ? undefined : Number(e.target.value) }, false)} onBlur={persist} />
        </>
      );
  }
}

function LessonMd({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  // Re-seed when the file changes underneath us (external edit / our own save
  // echoed back via reload). React's "adjust state on prop change" pattern —
  // a during-render reset, not a setState-in-effect.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }
  return (
    <textarea
      className="course-author__md"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== initial) onSave(text); }}
      spellCheck={false}
      rows={10}
    />
  );
}
