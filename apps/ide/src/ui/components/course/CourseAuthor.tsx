import { useEffect, useRef, useState } from "react";
import { AUTHORABLE_MACHINES, courseMetaText, readCourseMeta } from "@app";
import type { CourseMeta } from "@app";
import "./CourseAuthor.css";

// Course Author surface (#139, phase 1) — a structured view over the
// course-as-project files. Phase 1 edits course.json (CourseMeta); later phases
// add lesson CRUD, the check builder, and live preview. Persists through the
// host's multi-file writer (project.applyEdits) — never touches raw JSON in the
// editor. Form holds local state; it persists on blur and re-seeds when
// course.json changes underneath it (e.g. snapshot restore).

const EMPTY: CourseMeta = { title: "", description: "", machine: AUTHORABLE_MACHINES[0]! };

export function CourseAuthor({ files, onSave }: {
  files: { path: string; content: string }[];
  onSave: (courseJsonText: string) => void;
}) {
  const [meta, setMeta] = useState<CourseMeta>(() => readCourseMeta(files) ?? EMPTY);
  // Text we last emitted, so a reload echoing our own write doesn't re-seed.
  const lastText = useRef(courseMetaText(meta));

  // Re-seed when course.json changes externally (not from our own persist).
  useEffect(() => {
    const incoming = readCourseMeta(files);
    if (!incoming) return;
    const text = courseMetaText(incoming);
    if (text !== lastText.current) {
      setMeta(incoming);
      lastText.current = text;
    }
  }, [files]);

  const persist = (next: CourseMeta) => {
    const text = courseMetaText(next);
    if (text === lastText.current) return;
    lastText.current = text;
    onSave(text);
  };

  return (
    <div className="course-author">
      <div className="course-author__title label">Course</div>
      <div className="course-author__form">
        <label className="course-author__field">
          <span>Title</span>
          <input
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            onBlur={() => persist(meta)}
            placeholder="My course"
            spellCheck={false}
          />
        </label>

        <label className="course-author__field">
          <span>Description</span>
          <textarea
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            onBlur={() => persist(meta)}
            placeholder="One-line summary shown in the picker."
            rows={3}
            spellCheck={false}
          />
        </label>

        <label className="course-author__field">
          <span>Machine</span>
          <select
            value={meta.machine}
            onChange={(e) => {
              const next = { ...meta, machine: e.target.value };
              setMeta(next);
              persist(next);
            }}
          >
            {AUTHORABLE_MACHINES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            {!AUTHORABLE_MACHINES.includes(meta.machine) && (
              <option value={meta.machine}>{meta.machine}</option>
            )}
          </select>
        </label>

        <label className="course-author__field">
          <span>Order <small>(optional sort hint)</small></span>
          <input
            type="number"
            value={meta.order ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              setMeta({ ...meta, order: v === "" ? undefined : Number(v) });
            }}
            onBlur={() => persist(meta)}
            placeholder="—"
          />
        </label>
      </div>

      <p className="course-author__hint">
        Editing <code>course.json</code>. Lessons, starter files, and checks come in the next phases (#139); for now author them in the file tree under <code>lessons/</code>.
      </p>
    </div>
  );
}
