import { listLessons, readCourseMeta, readLessonBody, readLessonChecks } from "@app";
import type { CheckReport, CourseCheck } from "@app";
import { CourseView, type CourseViewData } from "./CourseView";

// Course Author live preview (#139) — renders the course being authored exactly
// as a learner sees it, fed from the draft bundle files. It follows the ACTIVE
// lesson (the one open in the file tree); navigating in the preview selects a
// lesson (the host opens it), so preview-nav == author-nav. The Check button runs
// the active lesson's checks against its starter, commandeering the live emulator
// like the learner (3b).

export function CourseAuthorPreview({ files, activeLessonId, onSelectLesson, onCheckLesson }: {
  files: { path: string; content: string }[];
  activeLessonId: string | null;
  onSelectLesson: (lessonId: string) => void;
  onCheckLesson?: (lessonId: string, checks: CourseCheck[]) => Promise<CheckReport>;
}) {
  const meta = readCourseMeta(files);
  const lessons = listLessons(files);
  if (lessons.length === 0) {
    return <div className="course course--missing">No lessons yet — add one in Course Author.</div>;
  }
  const currentId = lessons.some((l) => l.id === activeLessonId) ? activeLessonId! : lessons[0]!.id;

  const data: CourseViewData = {
    title: meta?.title || "Untitled course",
    lessons: lessons.map((l) => ({ id: l.id, title: l.title })),
    currentId,
    body: readLessonBody(files, currentId),
    checks: readLessonChecks(files, currentId),
  };

  return (
    <CourseView
      data={data}
      onOpenLesson={onSelectLesson}
      onCheck={onCheckLesson ? (checks) => onCheckLesson(currentId, checks) : undefined}
      preview
    />
  );
}
