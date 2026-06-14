import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import { getCourse, getLesson, lessonNav } from "@app";
import type { CheckReport, CourseCheck } from "@app";
import { useCourses } from "../../hooks/useCourses";
import "./CoursePanel.css";

interface Props {
  /** Active course id (from the project manifest's course stamp). */
  courseId: string;
  /** Active lesson id within the course. */
  lessonId: string;
  /** Navigate to another lesson — App instantiates/switches the project. */
  onOpenLesson: (courseId: string, lessonId: string) => void;
  /** Run the lesson's declarative checks (assemble + headless run + evaluate).
   *  Optional — wired by App; absent until the check handler is connected. */
  onCheck?: (checks: CourseCheck[]) => Promise<CheckReport>;
  /** Re-fetch a remote course from its repo (preserves learner edits). */
  onRefresh?: (courseId: string) => Promise<void>;
  /** Discard this lesson's edits, restoring the (refreshed) starter files. */
  onReset?: (courseId: string, lessonId: string) => Promise<void>;
}

/** Course-mode lesson panel: rendered markdown theory + instructions, a lesson
 *  progress list, prev/next navigation, and a Check button. Lives in the left
 *  column below the file explorer. Lazy-loaded (pulls in react-markdown) so the
 *  course chunk stays out of the main bundle. The Check button is a placeholder
 *  until the declarative check runner lands (child 29540fd). */
export function CoursePanel({ courseId, lessonId, onOpenLesson, onCheck, onRefresh, onReset }: Props) {
  useCourses(); // subscribe: re-render after remote hydration / refresh, and hydrate on mount
  const course = getCourse(courseId);
  const lesson = getLesson(courseId, lessonId);
  const nav = useMemo(() => lessonNav(courseId, lessonId), [courseId, lessonId]);

  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<CheckReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(courseId); } finally { setRefreshing(false); }
  };
  const doReset = async () => {
    if (onReset) await onReset(courseId, lessonId);
  };

  // Reset the previous lesson's report when navigating.
  const navKey = `${courseId}/${lessonId}`;
  const [reportKey, setReportKey] = useState(navKey);
  if (reportKey !== navKey) {
    setReportKey(navKey);
    setReport(null);
  }

  if (!course || !lesson) {
    return <div className="course course--missing">Course content not found: {courseId}/{lessonId}</div>;
  }

  const checks = lesson.checks;
  const runCheck = async () => {
    if (!checks.length || !onCheck) return;
    setChecking(true);
    try {
      setReport(await onCheck(checks));
    } catch (e) {
      setReport({ pass: false, results: [{ kind: "build", pass: false, label: "check", message: String(e) }] });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="course" data-testid="course-panel">
      <header className="course__head">
        <div className="course__title">{course.title}</div>
        <div className="course__progress label">
          Lesson {nav.index + 1} / {nav.total}
        </div>
      </header>

      {course.source.kind === "github" && (
        <div className="course__source">
          <span className="course__source-repo" title={`installed ${new Date(course.source.fetchedAt).toLocaleString()}`}>
            {course.source.owner}/{course.source.repo}{course.source.ref ? `@${course.source.ref}` : ""}
          </span>
          {onRefresh && (
            <button
              type="button"
              className="course__refresh"
              disabled={refreshing}
              onClick={() => void doRefresh()}
              data-testid="course.refresh"
            >{refreshing ? "refreshing…" : "↻ Refresh"}</button>
          )}
        </div>
      )}

      <ol className="course__lessons">
        {course.lessons.map((id, i) => {
          const l = getLesson(courseId, id);
          const current = id === lessonId;
          return (
            <li key={id}>
              <button
                type="button"
                className={"course__lesson" + (current ? " course__lesson--on" : "")}
                onClick={() => { if (!current) onOpenLesson(courseId, id); }}
                aria-current={current ? "step" : undefined}
                data-testid={`course.lesson.${id}`}
              >
                <span className="course__lesson-n">{i + 1}</span>
                <span className="course__lesson-name">{l?.title ?? id}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="course__body">
        <Markdown>{lesson.body}</Markdown>

        {report && (
          <div
            className={"course__report" + (report.pass ? " course__report--pass" : " course__report--fail")}
            data-testid="course.report"
          >
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
          <button
            type="button"
            className="course__reset-btn"
            onClick={() => void doReset()}
            data-testid="course.reset"
          >Reset lesson to starter</button>
        </div>
      )}

      <footer className="course__nav">
        <button
          type="button"
          className="course__navbtn"
          disabled={!nav.prev}
          onClick={() => nav.prev && onOpenLesson(courseId, nav.prev)}
          data-testid="course.prev"
        >‹ Prev</button>
        <button
          type="button"
          className="course__check"
          disabled={checking || !checks.length || !onCheck}
          title={checks.length ? "Assemble, run, and verify this lesson" : "This lesson has no checks"}
          onClick={() => void runCheck()}
          data-testid="course.check"
        >{checking ? "Checking…" : "Check"}</button>
        <button
          type="button"
          className="course__navbtn"
          disabled={!nav.next}
          onClick={() => nav.next && onOpenLesson(courseId, nav.next)}
          data-testid="course.next"
        >Next ›</button>
      </footer>
    </section>
  );
}
