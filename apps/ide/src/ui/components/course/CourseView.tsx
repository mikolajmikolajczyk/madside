import { useState } from "react";
import Markdown from "react-markdown";
import type { CheckReport, CourseCheck, CourseChapter } from "@app";
import { errorMessage } from "@ports";
import "./CoursePanel.css";

// Presentational course/lesson view (#139) — pure data in, callbacks out. Both
// the learner panel (CoursePanel, fed from the installed-course store) and the
// authoring preview (CourseAuthorPreview, fed from the project files) render
// through this, so the author sees exactly what a learner sees. No store access.

export interface CourseViewData {
  title: string;
  /** GitHub provenance badge — learner view only; omit for preview. */
  source?: { label: string; fetchedAt: number };
  /** A deep link that opens this course directly (learner, GitHub courses). */
  shareUrl?: string;
  /** All lessons in order. */
  lessons: { id: string; title: string }[];
  /** Optional grouping of the lesson list under chapter headings. */
  chapters?: CourseChapter[];
  /** The lesson currently shown. */
  currentId: string;
  /** Rendered markdown body of the current lesson. */
  body: string;
  /** The current lesson's declarative checks. */
  checks: CourseCheck[];
}

export interface CourseViewProps {
  data: CourseViewData;
  onOpenLesson: (lessonId: string) => void;
  /** Run the current lesson's checks; absent ⇒ Check disabled. */
  onCheck?: (checks: CourseCheck[]) => Promise<CheckReport>;
  /** Re-fetch a remote course (learner, github only). */
  onRefresh?: () => Promise<void>;
  /** Reset the lesson to its starter (learner). */
  onReset?: () => Promise<void>;
  /** Show a "Preview" tag (authoring). */
  preview?: boolean;
}

export function CourseView({ data, onOpenLesson, onCheck, onRefresh, onReset, preview }: CourseViewProps) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<CheckReport | null>(null);
  const [shared, setShared] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const index = data.lessons.findIndex((l) => l.id === data.currentId);
  const total = data.lessons.length;
  const prev = index > 0 ? data.lessons[index - 1]!.id : undefined;
  const next = index >= 0 && index < total - 1 ? data.lessons[index + 1]!.id : undefined;

  // Group the lesson list under chapter headings (keeping each lesson's global
  // number + flat prev/next). No chapters ⇒ a single untitled group = flat list.
  const numOf = new Map(data.lessons.map((l, i) => [l.id, i]));
  const groups: { title: string | null; items: { id: string; title: string; n: number }[] }[] = [];
  if (data.chapters?.length) {
    const grouped = new Set<string>();
    for (const ch of data.chapters) {
      const items = ch.lessons
        .filter((id) => numOf.has(id))
        .map((id) => { grouped.add(id); return { id, title: data.lessons[numOf.get(id)!]!.title, n: numOf.get(id)! }; });
      if (items.length) groups.push({ title: ch.title, items });
    }
    const rest = data.lessons.filter((l) => !grouped.has(l.id)).map((l) => ({ id: l.id, title: l.title, n: numOf.get(l.id)! }));
    if (rest.length) groups.push({ title: null, items: rest });
  } else {
    groups.push({ title: null, items: data.lessons.map((l) => ({ id: l.id, title: l.title, n: numOf.get(l.id)! })) });
  }

  // Drop a stale report when the shown lesson changes.
  const [reportKey, setReportKey] = useState(data.currentId);
  if (reportKey !== data.currentId) {
    setReportKey(data.currentId);
    setReport(null);
  }

  const doRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const runCheck = async () => {
    if (!data.checks.length || !onCheck) return;
    setChecking(true);
    try {
      setReport(await onCheck(data.checks));
    } catch (e) {
      setReport({ pass: false, results: [{ kind: "build", pass: false, label: "check", message: errorMessage(e) }] });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="course" data-testid="course-panel">
      <header className="course__head">
        <div className="course__title">{data.title}{preview && <span className="course__preview-tag"> · preview</span>}</div>
        <div className="course__progress label">
          Lesson {index < 0 ? 0 : index + 1} / {total}
        </div>
      </header>

      {data.source && (
        <div className="course__source">
          <span className="course__source-repo" title={`installed ${new Date(data.source.fetchedAt).toLocaleString()}`}>
            {data.source.label}
          </span>
          {onRefresh && (
            <button type="button" className="course__refresh" disabled={refreshing} onClick={() => void doRefresh()} data-testid="course.refresh">
              {refreshing ? "refreshing…" : "↻ Refresh"}
            </button>
          )}
          {data.shareUrl && (
            <button
              type="button"
              className="course__refresh"
              title="Copy a link that opens this course"
              onClick={() => { void navigator.clipboard?.writeText(data.shareUrl!); setShared(true); setTimeout(() => setShared(false), 1500); }}
              data-testid="course.share"
            >
              {shared ? "copied ✓" : "🔗 Share"}
            </button>
          )}
        </div>
      )}

      <ol className="course__lessons">
        {groups.map((g, gi) => (
          <li key={g.title ?? `__rest${gi}`} className="course__group">
            {g.title && <div className="course__chapter">{g.title}</div>}
            <ol className="course__group-list">
              {g.items.map((l) => {
                const current = l.id === data.currentId;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={"course__lesson" + (current ? " course__lesson--on" : "")}
                      onClick={() => { if (!current) onOpenLesson(l.id); }}
                      aria-current={current ? "step" : undefined}
                      data-testid={`course.lesson.${l.id}`}
                    >
                      <span className="course__lesson-n">{l.n + 1}</span>
                      <span className="course__lesson-name">{l.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      <div className="course__body">
        <Markdown>{data.body}</Markdown>

        {report && (
          <div className={"course__report" + (report.pass ? " course__report--pass" : " course__report--fail")} data-testid="course.report">
            <div className="course__report-head">{report.pass ? "✓ All checks passed" : "✗ Some checks failed"}</div>
            <ul className="course__report-list">
              {report.results.map((r, i) => (
                <li key={i} className={r.pass ? "is-pass" : "is-fail"}>
                  <span className="course__report-mark">{r.pass ? "✓" : "✗"}</span>
                  <span className="course__report-text">{r.label} — {r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {onReset && (
        <div className="course__reset">
          <button type="button" className="course__reset-btn" onClick={() => { if (onReset) void onReset(); }} data-testid="course.reset">
            Reset lesson to starter
          </button>
        </div>
      )}

      <footer className="course__nav">
        <button type="button" className="course__navbtn" disabled={!prev} onClick={() => prev && onOpenLesson(prev)} data-testid="course.prev">‹ Prev</button>
        <button
          type="button"
          className="course__check"
          disabled={checking || !data.checks.length || !onCheck}
          title={!onCheck ? "Check runs in the learner view" : data.checks.length ? "Assemble, run, and verify this lesson" : "This lesson has no checks"}
          onClick={() => void runCheck()}
          data-testid="course.check"
        >{checking ? "Checking…" : "Check"}</button>
        <button type="button" className="course__navbtn" disabled={!next} onClick={() => next && onOpenLesson(next)} data-testid="course.next">Next ›</button>
      </footer>
    </section>
  );
}
