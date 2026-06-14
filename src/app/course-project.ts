// Lesson → project instantiation (epic 2e9c7cc, child 500f11c). Opening a
// lesson makes its starter files the active project. Lessons are *persistent*
// per-lesson projects, not throwaways: re-opening a lesson reuses the project
// already in storage so a learner's edits survive navigating away and back.
//
// The project carries its lesson identity in `manifest.course = { id, lesson }`
// (parsed by parseProjectManifest), so course mode and the lesson panel derive
// purely from the active project — no separate global state to persist or keep
// in sync.

import {
  createProject,
  listProjects,
  loadProject,
  saveFile,
  MANIFEST_PATH,
  textToBytes,
  type Manifest,
} from '@adapters/storage-idb'
import { getCourse, getLesson } from './courses'

/** Project id of an existing project instantiated from this lesson, or
 *  undefined if the learner has not opened it yet. */
export async function findLessonProject(courseId: string, lessonId: string): Promise<string | undefined> {
  for (const p of await listProjects()) {
    const loaded = await loadProject(p.id)
    const c = loaded?.manifest.course
    if (c && c.id === courseId && c.lesson === lessonId) return p.id
  }
  return undefined
}

/** Open a course lesson as a project and return its id (the caller switches to
 *  it via the project store's `switchProject`). Reuses the persisted lesson
 *  project when one exists — preserving edits — otherwise instantiates the
 *  lesson's starter files, stamping `manifest.course` so the project is
 *  recognisably a course lesson. Throws on an unknown course/lesson id. */
export async function openLesson(courseId: string, lessonId: string): Promise<string> {
  const existing = await findLessonProject(courseId, lessonId)
  if (existing) return existing

  const course = getCourse(courseId)
  const lesson = getLesson(courseId, lessonId)
  if (!course || !lesson) throw new Error(`openLesson: unknown lesson '${courseId}/${lessonId}'`)

  const manifestFile = lesson.files.find((f) => f.path === MANIFEST_PATH)
  if (!manifestFile) throw new Error(`lesson '${courseId}/${lessonId}' missing ${MANIFEST_PATH}`)
  const base = JSON.parse(manifestFile.content) as Manifest
  const name = `${course.title} — ${lesson.title}`
  const manifest: Manifest = { ...base, name, course: { id: courseId, lesson: lessonId } }

  const files = [
    ...lesson.files
      .filter((f) => f.path !== MANIFEST_PATH)
      .map((f) => ({ path: f.path, content: textToBytes(f.content) })),
    { path: MANIFEST_PATH, content: textToBytes(JSON.stringify(manifest, null, 2) + '\n') },
  ]
  const row = await createProject(name, files, manifest)
  return row.id
}

/** Overwrite a lesson project's files with the lesson's (possibly refreshed)
 *  starter files — the explicit "reset to starter" escape hatch that discards
 *  the learner's edits for this lesson. The course-stamped manifest is
 *  preserved. Returns the project id, or undefined if the lesson hasn't been
 *  opened yet. */
export async function resetLessonToStarter(courseId: string, lessonId: string): Promise<string | undefined> {
  const projectId = await findLessonProject(courseId, lessonId)
  if (!projectId) return undefined
  const lesson = getLesson(courseId, lessonId)
  if (!lesson) throw new Error(`resetLessonToStarter: unknown lesson '${courseId}/${lessonId}'`)

  const loaded = await loadProject(projectId)
  const manifest = loaded?.manifest // keep the existing course-stamped manifest

  for (const f of lesson.files) {
    if (f.path === MANIFEST_PATH) continue // never let the starter clobber the stamped manifest
    await saveFile(projectId, f.path, textToBytes(f.content))
  }
  if (manifest) {
    await saveFile(projectId, MANIFEST_PATH, textToBytes(JSON.stringify(manifest, null, 2) + '\n'))
  }
  return projectId
}

export interface LessonNav {
  /** 0-based position of the lesson within the course. -1 if not found. */
  index: number
  /** Total lessons in the course. */
  total: number
  /** Previous / next lesson ids, undefined at the ends. */
  prev?: string
  next?: string
}

/** Prev/next neighbours + position of a lesson within its course. */
export function lessonNav(courseId: string, lessonId: string): LessonNav {
  const lessons = getCourse(courseId)?.lessons ?? []
  const index = lessons.indexOf(lessonId)
  return {
    index,
    total: lessons.length,
    prev: index > 0 ? lessons[index - 1] : undefined,
    next: index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : undefined,
  }
}
