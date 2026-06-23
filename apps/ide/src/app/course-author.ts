// Course authoring (#139) — the "course-as-project" model. A course is authored
// as an ordinary project whose files ARE the course directory layout
// (course.json + lessons/<nn>-<slug>/{lesson.md, files/*, check.json}); the
// Course Author surface edits them through structured forms. This keeps the
// authored format identical to what the course runtime loads (courses.ts), so
// authoring needs no new contract — just a structured view over project files
// plus normal multi-file writes (project.applyEdits). See issue #139.

import { MANIFEST_PATH, textToBytes } from '@madside/storage-idb'
import type { ProjectManifestV2 as Manifest, ProjectRow, StorageBackend } from '@ports'
import type { CourseCheck, CourseMeta } from './courses'

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
}

const DEFAULT_MACHINE = 'atari-xl'

/** Machine ids a new course can target (seed defaults exist for these). */
export const AUTHORABLE_MACHINES = Object.keys(SEED)

/** True when a project's files include a root `course.json` — i.e. it is a course
 *  being authored (course-as-project model). */
export function isCourseAuthoring(files: readonly { path: string }[]): boolean {
  return files.some((f) => f.path === COURSE_FILE)
}

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
  }
  return JSON.stringify(ordered, null, 2) + '\n'
}

const json = (o: unknown): string => JSON.stringify(o, null, 2) + '\n'

/** Create a new course-authoring project: a container `project.json` (so it loads
 *  as a normal project) + `course.json` (CourseMeta) + one stub lesson laid out
 *  in the directory shape the course runtime expects. The Course Author surface
 *  (#139) edits these via forms. */
export async function createCourseProject(
  storage: StorageBackend,
  opts?: { name?: string; machine?: string },
): Promise<ProjectRow> {
  const machine = opts?.machine && SEED[opts.machine] ? opts.machine : DEFAULT_MACHINE
  const name = opts?.name?.trim() || 'Untitled course'
  const s = SEED[machine]!

  const meta: CourseMeta = { title: name, description: 'A new course.', machine }
  // Container manifest: makes the authoring project a valid, loadable project.
  const container: Manifest = { version: 2, name, main: s.main, machine, toolchain: s.toolchain }
  // The stub lesson's own starter project (what a learner instantiates).
  const lessonManifest: Manifest = { version: 2, name: `${name} — lesson 1`, main: s.main, machine, toolchain: s.toolchain }
  const check: { checks: CourseCheck[] } = { checks: [{ kind: 'build' }] }

  const files = [
    { path: MANIFEST_PATH, content: textToBytes(json(container)) },
    { path: COURSE_FILE, content: textToBytes(courseMetaText(meta)) },
    { path: 'lessons/01-intro/lesson.md', content: textToBytes('# Introduction\n\nWrite the lesson theory here.\n') },
    { path: `lessons/01-intro/files/${MANIFEST_PATH}`, content: textToBytes(json(lessonManifest)) },
    { path: `lessons/01-intro/files/${s.main}`, content: textToBytes('; lesson 1 starter — your code here\n') },
    { path: 'lessons/01-intro/check.json', content: textToBytes(json(check)) },
  ]
  return storage.projects.create(name, files, container)
}

// ── Lessons (#139 phase 2) ───────────────────────────────────────────────────

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

/** Collision-safe folder renames that swap two lessons' numeric prefixes (their
 *  order). Apply in sequence via `renameFolder` — a temp prefix avoids the
 *  transient collision when two dirs trade numbers. */
export function lessonSwapRenames(a: LessonInfo, b: LessonInfo): { from: string; to: string }[] {
  const tmp = `lessons/__swap-${a.slug}`
  return [
    { from: a.dir, to: tmp },
    { from: b.dir, to: `lessons/${pad(a.n)}-${b.slug}` },
    { from: tmp, to: `lessons/${pad(b.n)}-${a.slug}` },
  ]
}

/** Files for a brand-new lesson appended after the existing ones (next numeric
 *  prefix). Mirrors the seed lesson's shape — a starter project + a build check. */
export function newLessonFiles(lessons: readonly LessonInfo[], machine: string): { path: string; content: string }[] {
  const n = lessons.reduce((max, l) => Math.max(max, l.n), 0) + 1
  const dir = `lessons/${pad(n)}-new-lesson`
  const s = SEED[machine] ?? SEED[DEFAULT_MACHINE]!
  const lessonManifest: Manifest = { version: 2, name: `Lesson ${n}`, main: s.main, machine, toolchain: s.toolchain }
  const check: { checks: CourseCheck[] } = { checks: [{ kind: 'build' }] }
  return [
    { path: `${dir}/lesson.md`, content: '# New lesson\n\nWrite the lesson here.\n' },
    { path: `${dir}/files/${MANIFEST_PATH}`, content: json(lessonManifest) },
    { path: `${dir}/files/${s.main}`, content: '; lesson starter — your code here\n' },
    { path: `${dir}/check.json`, content: json(check) },
  ]
}
