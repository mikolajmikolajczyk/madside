// Course authoring (#139) — the "course-as-project" model. A course is authored
// as an ordinary project whose files ARE the course directory layout
// (course.json + lessons/<nn>-<slug>/{lesson.md, files/*, check.json}); the
// Course Author surface edits them through structured forms. This keeps the
// authored format identical to what the course runtime loads (courses.ts), so
// authoring needs no new contract — just a structured view over project files
// plus normal multi-file writes (project.applyEdits). See issue #139.

import { zipSync } from 'fflate'
import { MANIFEST_PATH, newProjectId, textToBytes } from '@madside/storage-shared'
import type { InstalledCourseRow, ProjectManifestV2 as Manifest, StorageBackend } from '@ports'
import { addRemoteCourse, validateCourseFiles, type CourseCheck, type CourseMeta } from './courses'

/** Supplies a buildable starter file set (project.json + sources, relative to a
 *  lesson's `files/` dir) for a machine — injected by the host so this module
 *  stays decoupled from the app's template system (a future courses-core pkg).
 *  The app passes `starterFilesForMachine`; omitted ⇒ a minimal stub. */
export type LessonStarterProvider = (machine: string) => { path: string; content: string }[] | undefined

/** Root descriptor file whose presence marks a project as a course in authoring. */
export const COURSE_FILE = 'course.json'

// Per-machine seed defaults for a fresh authoring project (the form changes them
// afterwards). Covers the four built-in machines; z80 targets z88dk, the 6502
// machines default to mads assembly.
const SEED: Record<string, { toolchain: string; main: string }> = {
  'atari-xl': { toolchain: 'mads', main: 'src/main.a65' },
  nes: { toolchain: 'mads', main: 'src/main.a65' },
  c64: { toolchain: 'mads', main: 'src/main.a65' },
  'zx-spectrum': { toolchain: 'z88dk', main: 'src/main.asm' },
  zx128: { toolchain: 'z88dk', main: 'src/main.asm' },
  genesis: { toolchain: 'clownassembler', main: 'src/main.asm' },
}

const DEFAULT_MACHINE = 'atari-xl'

/** Machine ids a new course can target (seed defaults exist for these). */
export const AUTHORABLE_MACHINES = Object.keys(SEED)

/** Parse the authored course's `course.json` into `CourseMeta`, or null when it's
 *  absent or malformed. */
export function readCourseMeta(files: readonly { path: string; content: string }[]): CourseMeta | null {
  const f = files.find((x) => x.path === COURSE_FILE)
  if (!f) return null
  try {
    return JSON.parse(f.content) as CourseMeta
  } catch {
    return null
  }
}

/** Serialize `CourseMeta` back to `course.json` text — stable key order, trailing
 *  newline, `order` omitted when unset. */
export function courseMetaText(meta: CourseMeta): string {
  const ordered: CourseMeta = {
    title: meta.title,
    description: meta.description,
    machine: meta.machine,
    ...(meta.order != null ? { order: meta.order } : {}),
    ...(meta.chapters?.length ? { chapters: meta.chapters } : {}),
  }
  return JSON.stringify(ordered, null, 2) + '\n'
}

const json = (o: unknown): string => JSON.stringify(o, null, 2) + '\n'

/** A buildable starter file set for a lesson (relative to its `files/` dir:
 *  project.json + sources) — the matching machine template so a fresh lesson's
 *  `build` check passes, falling back to a minimal stub for an unmapped machine. */
function lessonStarter(machine: string, name: string, starterFor?: LessonStarterProvider): { path: string; content: string }[] {
  const fromTemplate = starterFor?.(machine)
  if (fromTemplate) return fromTemplate
  const s = SEED[machine] ?? SEED[DEFAULT_MACHINE]!
  return [
    { path: MANIFEST_PATH, content: json({ version: 2, name, main: s.main, machine, toolchain: s.toolchain } satisfies Manifest) },
    { path: s.main, content: '; starter — your code here\n' },
  ]
}

// ── Draft course bundle (#139 rework) — authoring = inverse of the learner ────
// A course is a bundle in the courses store (source.kind 'local'). Authoring
// edits the bundle; the active lesson is opened with the SAME `openLesson` a
// learner uses, so the file tree is a normal lesson project (no container, no
// filtered view). These helpers own the bundle CRUD; switching/save-back live in
// the UI (course-project + the Course Author panel).

/** The course-root-relative files for a fresh draft: course.json + one buildable
 *  lesson (its starter from the machine template). */
export function draftCourseFiles(name: string, machine: string, starterFor?: LessonStarterProvider): { path: string; content: string }[] {
  const meta: CourseMeta = { title: name, description: 'A new course.', machine }
  const dir = 'lessons/01-intro'
  const check: { checks: CourseCheck[] } = { checks: [{ kind: 'build' }] }
  return [
    { path: COURSE_FILE, content: courseMetaText(meta) },
    { path: `${dir}/lesson.md`, content: '# Introduction\n\nWrite the lesson theory here.\n' },
    ...lessonStarter(machine, `${name} — lesson 1`, starterFor).map((f) => ({ path: `${dir}/files/${f.path}`, content: f.content })),
    { path: `${dir}/check.json`, content: json(check) },
  ]
}

/** Persist + register a draft course bundle (install or overwrite by id), so the
 *  learner read API (`getCourse`/`getLesson`) + preview see it immediately. */
export async function saveDraftCourse(storage: StorageBackend, courseId: string, files: { path: string; content: string }[]): Promise<void> {
  // Preserve the row's provenance (kind/owner/repo/ref/slug) when it already
  // exists, so editing an installed GitHub course in-place keeps it a GitHub
  // course (and only its files change); a brand-new course starts as a local draft.
  const existing = await storage.courses.get(courseId)
  const row: InstalledCourseRow = existing ? { ...existing, files } : { sourceId: courseId, kind: 'local', fetchedAt: 0, files }
  await addRemoteCourse(storage, row)
}

/** The stored files of a draft course, or null if it's gone. */
export async function getDraftCourse(storage: StorageBackend, courseId: string): Promise<{ path: string; content: string }[] | null> {
  const row = await storage.courses.get(courseId)
  return row?.files ?? null
}

/** Create a new draft course bundle. Returns its id + first lesson id; the caller
 *  opens that lesson (openLesson) to start editing. */
export async function createDraftCourse(storage: StorageBackend, opts?: { name?: string; machine?: string; starter?: LessonStarterProvider }): Promise<{ courseId: string; lessonId: string }> {
  const machine = opts?.machine && SEED[opts.machine] ? opts.machine : DEFAULT_MACHINE
  const name = opts?.name?.trim() || 'Untitled course'
  const files = draftCourseFiles(name, machine, opts?.starter)
  const courseId = `local:${newProjectId(name)}`
  await saveDraftCourse(storage, courseId, files)
  return { courseId, lessonId: listLessons(files)[0]!.id }
}

/** Create a draft course bundle from imported files (folder/zip), rebased onto
 *  the course root + validated. Returns its id + first lesson id. */
export async function importDraftCourse(storage: StorageBackend, courseFiles: readonly { path: string; content: string }[]): Promise<{ courseId: string; lessonId: string }> {
  const files = rebaseCourseFiles(courseFiles)
  const v = validateCourseFiles(files)
  if (!v.ok) throw new Error(v.error ?? 'invalid course')
  const first = listLessons(files)[0]
  if (!first) throw new Error('course has no lessons')
  const courseId = `local:${newProjectId(readCourseMeta(files)?.title ?? 'course')}`
  await saveDraftCourse(storage, courseId, files)
  return { courseId, lessonId: first.id }
}

// ── Bundle edits (#139 rework) — pure transforms over the course files ────────
// All authoring edits are pure (files[]) → (files[]); the UI saves the result via
// saveDraftCourse. No project-file ops / folder renames — the course lives in the
// bundle, not the file tree.

function upsertFile(files: readonly { path: string; content: string }[], path: string, content: string): { path: string; content: string }[] {
  const i = files.findIndex((f) => f.path === path)
  if (i < 0) return [...files, { path, content }]
  return files.map((f, j) => (j === i ? { path, content } : f))
}

/** Replace course.json with new metadata. */
export function setCourseMetaInFiles(files: readonly { path: string; content: string }[], meta: CourseMeta): { path: string; content: string }[] {
  return upsertFile(files, COURSE_FILE, courseMetaText(meta))
}

/** The chapter title a lesson belongs to, or null when ungrouped. */
export function lessonChapter(meta: CourseMeta, lessonId: string): string | null {
  return meta.chapters?.find((c) => c.lessons.includes(lessonId))?.title ?? null
}

/** Move a lesson into a chapter (creating it if new), or out of any chapter when
 *  `title` is null. Pure: returns new meta. Empty chapters are pruned, and a new
 *  chapter is appended (chapter order = creation order). */
export function assignLessonToChapter(meta: CourseMeta, lessonId: string, title: string | null): CourseMeta {
  const name = title?.trim() || null
  // Drop the lesson from every chapter first.
  let chapters = (meta.chapters ?? []).map((c) => ({ ...c, lessons: c.lessons.filter((id) => id !== lessonId) }))
  if (name) {
    const i = chapters.findIndex((c) => c.title === name)
    if (i >= 0) chapters[i] = { ...chapters[i]!, lessons: [...chapters[i]!.lessons, lessonId] }
    else chapters = [...chapters, { title: name, lessons: [lessonId] }]
  }
  chapters = chapters.filter((c) => c.lessons.length > 0) // prune empties
  return { ...meta, chapters: chapters.length ? chapters : undefined }
}

/** Replace a lesson's markdown. */
export function setLessonMdInFiles(files: readonly { path: string; content: string }[], lessonId: string, md: string): { path: string; content: string }[] {
  return upsertFile(files, `lessons/${lessonId}/lesson.md`, md)
}

/** Replace a lesson's checks (check.json). */
export function setLessonChecksInFiles(files: readonly { path: string; content: string }[], lessonId: string, checks: CourseCheck[]): { path: string; content: string }[] {
  return upsertFile(files, `lessons/${lessonId}/check.json`, json({ checks }))
}

/** Replace a lesson's starter files (under `lessons/<id>/files/`) — the save-back
 *  of the working project when switching lessons / exporting. `starter` paths are
 *  relative to the lesson's `files/` dir. */
export function setLessonStarterInFiles(
  files: readonly { path: string; content: string }[],
  lessonId: string,
  starter: readonly { path: string; content: string }[],
): { path: string; content: string }[] {
  const prefix = `lessons/${lessonId}/files/`
  const kept = files.filter((f) => !f.path.startsWith(prefix))
  return [...kept, ...starter.map((f) => ({ path: prefix + f.path, content: f.content }))]
}

/** Append a new lesson (next numeric prefix) with a buildable starter + build
 *  check. Returns the new files + the new lesson id. */
export function addLessonInFiles(files: readonly { path: string; content: string }[], machine: string, starterFor?: LessonStarterProvider): { files: { path: string; content: string }[]; lessonId: string } {
  const lessons = listLessons(files)
  const n = (lessons.length ? lessons[lessons.length - 1]!.n : 0) + 1
  const id = `${pad(n)}-new-lesson`
  const added = newLessonFiles(lessons, machine, starterFor).map((f) => ({ path: f.path, content: f.content }))
  return { files: [...files, ...added], lessonId: id }
}

/** Remove a lesson (its whole subtree). */
export function deleteLessonInFiles(files: readonly { path: string; content: string }[], lessonId: string): { path: string; content: string }[] {
  return files.filter((f) => !f.path.startsWith(`lessons/${lessonId}/`)).map((f) => ({ path: f.path, content: f.content }))
}

/** Swap two lessons' order by rewriting their numeric prefixes (pure path
 *  rewrite — no collision dance needed on an array). Returns the new files. */
export function swapLessonsInFiles(files: readonly { path: string; content: string }[], idA: string, idB: string): { path: string; content: string }[] {
  const lessons = listLessons(files)
  const a = lessons.find((l) => l.id === idA)
  const b = lessons.find((l) => l.id === idB)
  if (!a || !b) return files.map((f) => ({ path: f.path, content: f.content }))
  const aNew = `lessons/${pad(b.n)}-${a.slug}`
  const bNew = `lessons/${pad(a.n)}-${b.slug}`
  return files.map((f) => {
    if (f.path === a.dir || f.path.startsWith(a.dir + '/')) return { path: aNew + f.path.slice(a.dir.length), content: f.content }
    if (f.path === b.dir || f.path.startsWith(b.dir + '/')) return { path: bNew + f.path.slice(b.dir.length), content: f.content }
    return { path: f.path, content: f.content }
  })
}

// ── Lessons (#139) ───────────────────────────────────────────────────────────

/** Rebase a set of files onto the course root: find the shallowest `course.json`
 *  and strip its directory prefix from every path (dropping anything outside it).
 *  Handles a picked folder (`my-course/course.json` → `course.json`) and a zip
 *  already at the root (`course.json` → unchanged). Used by import. */
export function rebaseCourseFiles(
  files: readonly { path: string; content: string }[],
): { path: string; content: string }[] {
  const cj = files
    .filter((f) => f.path === 'course.json' || f.path.endsWith('/course.json'))
    .sort((a, b) => a.path.length - b.path.length)[0]
  if (!cj) return files.map((f) => ({ path: f.path, content: f.content }))
  const root = cj.path.slice(0, cj.path.length - 'course.json'.length) // '' or 'dir/'
  return files
    .filter((f) => f.path.startsWith(root))
    .map((f) => ({ path: f.path.slice(root.length), content: f.content }))
}

/** A lesson parsed from the authored project's `lessons/<nn>-<slug>/` tree. */
export interface LessonInfo {
  /** Full course-root-relative dir, e.g. `lessons/01-intro`. */
  dir: string
  /** Dir name, e.g. `01-intro`. */
  id: string
  /** Numeric order prefix. */
  n: number
  /** Slug after the `<nn>-` prefix. */
  slug: string
  /** First `# ` heading in lesson.md, else the slug. */
  title: string
}

const LESSON_RE = /^lessons\/(\d+)-([^/]+)\//

const pad = (n: number): string => String(n).padStart(2, '0')

/** Slugify a title into a lesson-dir-safe slug. */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson'
}

/** List the authored lessons (sorted by numeric prefix) from the project files. */
export function listLessons(files: readonly { path: string; content: string }[]): LessonInfo[] {
  const byId = new Map<string, { n: number; slug: string; md?: string }>()
  for (const f of files) {
    const m = LESSON_RE.exec(f.path)
    if (!m) continue
    const id = `${m[1]}-${m[2]}`
    if (!byId.has(id)) byId.set(id, { n: Number(m[1]), slug: m[2]! })
    if (f.path === `lessons/${id}/lesson.md`) byId.get(id)!.md = f.content
  }
  const titleOf = (slug: string, md?: string): string => {
    const h = md?.split('\n').find((l) => l.startsWith('# '))
    return h ? h.slice(2).trim() : slug
  }
  return [...byId.entries()]
    .map(([id, e]) => ({ dir: `lessons/${id}`, id, n: e.n, slug: e.slug, title: titleOf(e.slug, e.md) }))
    .sort((a, b) => a.n - b.n || a.id.localeCompare(b.id))
}

// ── Export (#139) ────────────────────────────────────────────────────────────

/** The publishable subset of an authoring project's files — what belongs in a
 *  course repo: `course.json` + `lessons/**`. Drops the authoring container
 *  (`project.json`), empty-dir placeholders, and generated output. The result is
 *  course-root-relative, ready for `validateCourseFiles` + a GitHub repo root. */
export function courseExportFiles(
  files: readonly { path: string; content: string }[],
): { path: string; content: string }[] {
  return files.filter(
    (f) =>
      (f.path === COURSE_FILE || f.path.startsWith('lessons/')) &&
      !f.path.endsWith('/.gitkeep') &&
      !f.path.startsWith('generated/'),
  ).map((f) => ({ path: f.path, content: f.content }))
}

/** Zip the course's publishable files (course.json at the root + lessons/**) for
 *  download → push to a public GitHub repo, where learners install it. */
export function zipCourse(files: readonly { path: string; content: string }[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const f of courseExportFiles(files)) entries[f.path] = textToBytes(f.content)
  return zipSync(entries, { level: 6 })
}

/** The markdown body of a lesson (its `lesson.md`), or '' if absent. */
export function readLessonBody(files: readonly { path: string; content: string }[], lessonId: string): string {
  return files.find((f) => f.path === `lessons/${lessonId}/lesson.md`)?.content ?? ''
}

/** The declarative checks of a lesson (its `check.json`'s `checks`), or [] if
 *  absent / malformed. */
export function readLessonChecks(files: readonly { path: string; content: string }[], lessonId: string): CourseCheck[] {
  const f = files.find((x) => x.path === `lessons/${lessonId}/check.json`)
  if (!f) return []
  try {
    const o = JSON.parse(f.content) as { checks?: unknown }
    return Array.isArray(o.checks) ? (o.checks as CourseCheck[]) : []
  } catch {
    return []
  }
}

/** Files for a brand-new lesson appended after the existing ones (next numeric
 *  prefix). Mirrors the seed lesson's shape — a starter project + a build check. */
export function newLessonFiles(lessons: readonly LessonInfo[], machine: string, starterFor?: LessonStarterProvider): { path: string; content: string }[] {
  const n = lessons.reduce((max, l) => Math.max(max, l.n), 0) + 1
  const dir = `lessons/${pad(n)}-new-lesson`
  const check: { checks: CourseCheck[] } = { checks: [{ kind: 'build' }] }
  const starter = lessonStarter(machine, `Lesson ${n}`, starterFor)
  return [
    { path: `${dir}/lesson.md`, content: '# New lesson\n\nWrite the lesson here.\n' },
    ...starter.map((f) => ({ path: `${dir}/files/${f.path}`, content: f.content })),
    { path: `${dir}/check.json`, content: json(check) },
  ]
}
