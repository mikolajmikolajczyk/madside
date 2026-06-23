import { useMemo } from "react";
import { getCourse, getLesson } from "@app";
import type { CheckReport, CourseCheck } from "@app";
import { useCourses } from "../../hooks/useCourses";
import { CourseView, type CourseViewData } from "./CourseView";

interface Props {
  /** Active course id (from the project manifest's course stamp). */
  courseId: string;
  /** Active lesson id within the course. */
  lessonId: string;
  /** Navigate to another lesson — App instantiates/switches the project. */
  onOpenLesson: (courseId: string, lessonId: string) => void;
  /** Run the lesson's declarative checks (assemble + headless run + evaluate). */
  onCheck?: (checks: CourseCheck[]) => Promise<CheckReport>;
  /** Re-fetch a remote course from its repo (preserves learner edits). */
  onRefresh?: (courseId: string) => Promise<void>;
  /** Discard this lesson's edits, restoring the (refreshed) starter files. */
  onReset?: (courseId: string, lessonId: string) => Promise<void>;
}

/** Course-mode lesson panel (learner view): loads the installed course from the
 *  store and renders it through the shared presentational `CourseView`. Lazy-
 *  loaded (pulls in react-markdown) so the course chunk stays out of the main
 *  bundle. The authoring preview feeds the same `CourseView` from project files. */
export function CoursePanel({ courseId, lessonId, onOpenLesson, onCheck, onRefresh, onReset }: Props) {
  useCourses(); // subscribe: re-render after remote hydration / refresh, hydrate on mount
  const course = getCourse(courseId);
  const lesson = getLesson(courseId, lessonId);

  const data = useMemo<CourseViewData | null>(() => {
    if (!course || !lesson) return null;
    return {
      title: course.title,
      source: course.source.kind === "github"
        ? { label: `${course.source.owner}/${course.source.repo}${course.source.ref ? `@${course.source.ref}` : ""}`, fetchedAt: course.source.fetchedAt }
        : undefined,
      lessons: course.lessons.map((id) => ({ id, title: getLesson(courseId, id)?.title ?? id })),
      currentId: lessonId,
      body: lesson.body,
      checks: lesson.checks,
    };
  }, [course, lesson, courseId, lessonId]);

  if (!data) {
    return <div className="course course--missing">Course content not found: {courseId}/{lessonId}</div>;
  }

  return (
    <CourseView
      data={data}
      onOpenLesson={(id) => onOpenLesson(courseId, id)}
      onCheck={onCheck}
      onRefresh={onRefresh ? () => onRefresh(courseId) : undefined}
      onReset={onReset ? () => onReset(courseId, lessonId) : undefined}
    />
  );
}
