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
