import { useEffect, useRef, useState } from "react";
import {
  AUTHORABLE_MACHINES,
  COURSE_FILE,
  courseMetaText,
  lessonSwapRenames,
  listLessons,
  newLessonFiles,
  readCourseMeta,
} from "@app";
import type { CourseMeta, LessonInfo } from "@app";
import "./CourseAuthor.css";

// Course Author surface (#139). A structured view over the course-as-project
// files: phase 1 = course.json metadata; phase 2 = lesson CRUD + reorder +
// lesson.md editing. Persists through the host's multi-file ops (no raw JSON in
// the editor). Later phases add the check builder + live preview + export.

export interface CourseAuthorOps {
  /** Write/create files in one batch (project.applyEdits — writeFile upserts). */
  save: (edits: { path: string; content: string }[]) => void;
  /** Remove a whole folder subtree (a lesson dir). */
  deleteFolder: (prefix: string) => void;
  /** Apply a sequence of folder-prefix renames (reorder). */
  renameFolders: (renames: { from: string; to: string }[]) => void;
}

const EMPTY: CourseMeta = { title: "", description: "", machine: AUTHORABLE_MACHINES[0]! };

export function CourseAuthor({ files, ops }: {
  files: { path: string; content: string }[];
  ops: CourseAuthorOps;
}) {
  const meta = readCourseMeta(files) ?? EMPTY;
  const lessons = listLessons(files);

  return (
    <div className="course-author">
      <div className="course-author__title label">Course Author</div>
      <MetaForm meta={meta} onSave={(m) => ops.save([{ path: COURSE_FILE, content: courseMetaText(m) }])} />

      <div className="course-author__section">
        <div className="course-author__section-head">
          <span>Lessons</span>
          <button
            type="button"
            className="course-author__btn"
            onClick={() => ops.save(newLessonFiles(lessons, meta.machine))}
            title="Add a lesson"
          >
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
                canUp={i > 0}
                canDown={i < lessons.length - 1}
                onUp={() => ops.renameFolders(lessonSwapRenames(lessons[i - 1]!, l))}
                onDown={() => ops.renameFolders(lessonSwapRenames(l, lessons[i + 1]!))}
                onDelete={() => {
                  if (window.confirm(`Delete lesson "${l.title}"? This removes ${l.dir}/ and cannot be undone.`)) {
                    ops.deleteFolder(l.dir);
                  }
                }}
                onSaveMd={(text) => ops.save([{ path: `${l.dir}/lesson.md`, content: text }])}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="course-author__hint">
        Starter files live under <code>{"<lesson>/files/"}</code> and the lesson check in <code>check.json</code> — edit those in the file tree for now (the check builder + starter-file UI come next, #139).
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

// ── One lesson row (reorder / delete / expand to edit lesson.md) ──────────────
function LessonRow({ lesson, files, canUp, canDown, onUp, onDown, onDelete, onSaveMd }: {
  lesson: LessonInfo;
  files: { path: string; content: string }[];
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onSaveMd: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mdPath = `${lesson.dir}/lesson.md`;
  const mdContent = files.find((f) => f.path === mdPath)?.content ?? "";

  return (
    <li className="course-author__lesson">
      <div className="course-author__lesson-head">
        <button type="button" className="course-author__caret" onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"}</button>
        <span className="course-author__lesson-n">{String(lesson.n).padStart(2, "0")}</span>
        <span className="course-author__lesson-title" title={lesson.dir}>{lesson.title}</span>
        <button type="button" className="course-author__icon" disabled={!canUp} onClick={onUp} title="Move up">↑</button>
        <button type="button" className="course-author__icon" disabled={!canDown} onClick={onDown} title="Move down">↓</button>
        <button type="button" className="course-author__icon course-author__icon--del" onClick={onDelete} title="Delete lesson">✕</button>
      </div>
      {open && <LessonMd key={mdPath} initial={mdContent} onSave={onSaveMd} />}
    </li>
  );
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
