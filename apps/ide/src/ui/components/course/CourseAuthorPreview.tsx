import { useState } from "react";
import { listLessons, readCourseMeta, readLessonBody, readLessonChecks } from "@app";
import type { CheckReport, CourseCheck } from "@app";
import { CourseView, type CourseViewData } from "./CourseView";

// Course Author live preview (#139) — renders the course being authored exactly
// as a learner sees it, fed from the project files (no install, no store). Lesson
// switching is local to the preview (it never switches the project). The Check
// button runs the shown lesson's checks against its OWN starter, commandeering
// the live emulator just like the learner (#139 3b, via onCheckLesson).

export function CourseAuthorPreview({ files, onCheckLesson }: {
  files: { path: string; content: string }[];
  onCheckLesson?: (lessonId: string, checks: CourseCheck[]) => Promise<CheckReport>;
}) {
  const meta = readCourseMeta(files);
  const lessons = listLessons(files);
  const [selected, setSelected] = useState<string | null>(null);

  // Effective selection — falls back to the first lesson when the chosen id is
  // gone (add / delete / reorder renumbers ids). No effect: derive each render.
  const currentId = selected && lessons.some((l) => l.id === selected) ? selected : lessons[0]?.id ?? "";

  if (lessons.length === 0) {
    return <div className="course course--missing">No lessons yet — add one in Course Author.</div>;
  }

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
      onOpenLesson={setSelected}
      onCheck={onCheckLesson ? (checks) => onCheckLesson(currentId, checks) : undefined}
      preview
    />
  );
}
