import { useMemo } from "react";
import Markdown from "react-markdown";
import { getCourse, getLesson, lessonNav } from "@app";
import "./CoursePanel.css";

interface Props {
  /** Active course id (from the project manifest's course stamp). */
  courseId: string;
  /** Active lesson id within the course. */
  lessonId: string;
  /** Navigate to another lesson — App instantiates/switches the project. */
  onOpenLesson: (courseId: string, lessonId: string) => void;
}

/** Course-mode lesson panel: rendered markdown theory + instructions, a lesson
 *  progress list, prev/next navigation, and a Check button. Lives in the left
 *  column below the file explorer. Lazy-loaded (pulls in react-markdown) so the
 *  course chunk stays out of the main bundle. The Check button is a placeholder
 *  until the declarative check runner lands (child 29540fd). */
export function CoursePanel({ courseId, lessonId, onOpenLesson }: Props) {
  const course = getCourse(courseId);
  const lesson = getLesson(courseId, lessonId);
  const nav = useMemo(() => lessonNav(courseId, lessonId), [courseId, lessonId]);

  if (!course || !lesson) {
    return <div className="course course--missing">Course content not found: {courseId}/{lessonId}</div>;
  }

  return (
    <section className="course" data-testid="course-panel">
      <header className="course__head">
        <div className="course__title">{course.title}</div>
        <div className="course__progress label">
          Lesson {nav.index + 1} / {nav.total}
        </div>
      </header>

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
      </div>

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
          disabled
          title="Check runner — coming soon"
          data-testid="course.check"
        >Check</button>
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
