// Interactive courses (epic 2e9c7cc) + remote course repositories (epic
// ecd5258). A course is an ordered set of lessons; each lesson carries theory
// (markdown), starter project files, an optional declarative check, and an
// optional reference solution.
//
//   <course-root>/
//     course.json                 # { title, description, machine, order? }
//     lessons/<nn>-<slug>/
//       lesson.md                 # theory + instructions (first H1 = title)
//       files/<path>              # starter project files (project.json + src/*)
//       check.json                # { checks: CourseCheck[] }  (optional)
//       solution/<path>           # reference solution (optional)
//
// Lesson order is the sorted lesson-directory name (the `<nn>-` numeric prefix).
//
// Courses come from two sources, merged into one read API:
//   - `bundled`  — ship with the app under repo-root `courses/`, Vite-globbed.
//   - `github`   — installed from a public GitHub repo (fetched via jsDelivr),
//                  persisted in IDB, hydrated into memory at startup.
// `listCourses`/`getCourse`/`getLesson` span both. A small subscribe/snapshot
// store lets React re-render when remote courses are hydrated/installed/removed
// (consumed via `useCourses`, ADR-0007 useSyncExternalStore style).

import type { InstalledCourseRow, StorageBackend } from '@ports'

/** A declarative lesson check. The runner (`@app/check-runner`) consumes these;
 *  authored as JSON in each lesson's check.json. Hex strings (e.g. "$0080")
 *  are used for addresses/values so assembly authors read them naturally. */
export type CourseCheck =
  | { kind: 'build' }
  | { kind: 'label'; name: string; addr?: string }
  | { kind: 'memory'; addr: string; equals: string; space?: string; afterFrames?: number }
  | { kind: 'register'; reg: 'a' | 'x' | 'y' | 'sp' | 'pc'; equals: string; afterFrames?: number }

/** course.json — the picker-facing course descriptor. */
export interface CourseMeta {
  title: string
  description: string
  /** Machine id the course targets (badge in the picker). */
  machine: string
  /** Sort hint for the listing (ascending; missing sorts last). */
  order?: number
}

/** Where a course came from. */
export type CourseSource =
  | { kind: 'bundled' }
  | {
      kind: 'github'
      sourceId: string
      owner: string
      repo: string
      ref: string
      resolvedRef?: string
      fetchedAt: number
    }

/** A lesson's content, fully loaded. */
export interface Lesson {
  id: string
  /** Display title — the first `# ` heading in lesson.md, else the slug. */
  title: string
  body: string
  /** Starter project files (project.json + sources), project-root relative. */
  files: { path: string; content: string }[]
  /** Declarative checks for the lesson's task, empty for pure-theory lessons. */
  checks: CourseCheck[]
  /** Optional reference solution files, project-root relative. */
  solution: { path: string; content: string }[]
}

/** Course listing entry (metadata + lesson ids + source, no lesson bodies). */
export interface CourseInfo extends CourseMeta {
  id: string
  lessons: string[]
  source: CourseSource
}

interface CourseBundle {
  id: string
  meta: CourseMeta
  lessons: Map<string, Lesson>
  source: CourseSource
}

// ---------------------------------------------------------------------------
// Bundle assembly (shared by the glob loader and the remote fetcher)
// ---------------------------------------------------------------------------

/** First `# Heading` line of a markdown body, else undefined. */
function firstHeading(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m)
  return m ? m[1]!.trim() : undefined
}

interface LessonAcc {
  files: { path: string; content: string }[]
  solution: { path: string; content: string }[]
  body?: string
  checks?: CourseCheck[]
}

/** Assemble a course from its course-root-relative files (`course.json`,
 *  `lessons/<id>/...`). Returns null if it has no descriptor or no usable
 *  lesson. Lenient — malformed parts are skipped (use `validateCourseFiles`
 *  for an error-reporting pass before installing untrusted content). */
function assembleCourse(files: { path: string; content: string }[]): { meta: CourseMeta; lessons: Map<string, Lesson> } | null {
  let meta: CourseMeta | undefined
  const lessonAccs = new Map<string, LessonAcc>()
  const accFor = (id: string): LessonAcc => {
    let l = lessonAccs.get(id)
    if (!l) {
      l = { files: [], solution: [] }
      lessonAccs.set(id, l)
    }
    return l
  }

  for (const { path, content } of files) {
    const parts = path.split('/')
    if (parts.length === 1 && parts[0] === 'course.json') {
      try { meta = JSON.parse(content) as CourseMeta } catch { /* skip malformed */ }
      continue
    }
    if (parts[0] !== 'lessons' || parts.length < 3) continue
    const lessonId = parts[1]!
    const tail = parts.slice(2)
    const l = accFor(lessonId)
    if (tail.length === 1 && tail[0] === 'lesson.md') {
      l.body = content
    } else if (tail.length === 1 && tail[0] === 'check.json') {
      try {
        const parsed = JSON.parse(content) as { checks?: CourseCheck[] }
        l.checks = parsed.checks ?? []
      } catch { /* skip malformed checks */ }
    } else if (tail[0] === 'files') {
      l.files.push({ path: tail.slice(1).join('/'), content })
    } else if (tail[0] === 'solution') {
      l.solution.push({ path: tail.slice(1).join('/'), content })
    }
  }

  if (!meta) return null
  const lessons = new Map<string, Lesson>()
  for (const [lessonId, l] of [...lessonAccs].sort(([a], [b]) => a.localeCompare(b))) {
    if (l.body == null) continue
    lessons.set(lessonId, {
      id: lessonId,
      title: firstHeading(l.body) ?? lessonId,
      body: l.body,
      files: [...l.files].sort((a, b) => a.path.localeCompare(b.path)),
      checks: l.checks ?? [],
      solution: [...l.solution].sort((a, b) => a.path.localeCompare(b.path)),
    })
  }
  if (lessons.size === 0) return null
  return { meta, lessons }
}

// ---------------------------------------------------------------------------
// Bundled courses (Vite glob)
// ---------------------------------------------------------------------------

const RAW = import.meta.glob('/courses/**/*', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

function loadGlobBundles(): Map<string, CourseBundle> {
  // Group glob entries by course id, course-root-relative.
  const byCourse = new Map<string, { path: string; content: string }[]>()
  for (const [key, content] of Object.entries(RAW)) {
    const rel = key.replace(/^\/courses\//, '')
    const slash = rel.indexOf('/')
    if (slash < 0) continue
    const courseId = rel.slice(0, slash)
    const path = rel.slice(slash + 1)
    const arr = byCourse.get(courseId) ?? []
    arr.push({ path, content })
    byCourse.set(courseId, arr)
  }
  const out = new Map<string, CourseBundle>()
  for (const [courseId, files] of byCourse) {
    const built = assembleCourse(files)
    if (built) out.set(courseId, { id: courseId, ...built, source: { kind: 'bundled' } })
  }
  return out
}

const BUNDLED = loadGlobBundles()

// ---------------------------------------------------------------------------
// Remote courses (installed from GitHub) + reactive store
// ---------------------------------------------------------------------------

const remote = new Map<string, CourseBundle>()

let snapshot: CourseInfo[] = computeSnapshot()
const listeners = new Set<() => void>()

function toInfo(b: CourseBundle): CourseInfo {
  return { id: b.id, ...b.meta, lessons: [...b.lessons.keys()], source: b.source }
}

function computeSnapshot(): CourseInfo[] {
  return [...BUNDLED.values(), ...remote.values()]
    .map(toInfo)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title))
}

function bump(): void {
  snapshot = computeSnapshot()
  for (const l of listeners) l()
}

/** Subscribe to course-registry changes (install / remove / hydrate). */
export function subscribeCourses(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Stable snapshot for useSyncExternalStore — same reference until a change. */
export function coursesSnapshot(): CourseInfo[] {
  return snapshot
}

/** Turn a persisted InstalledCourseRow into an in-memory bundle. */
function bundleFromRow(row: InstalledCourseRow): CourseBundle | null {
  const built = assembleCourse(row.files)
  if (!built) return null
  return {
    id: row.sourceId,
    ...built,
    source: {
      kind: 'github',
      sourceId: row.sourceId,
      owner: row.owner,
      repo: row.repo,
      ref: row.ref,
      resolvedRef: row.resolvedRef,
      fetchedAt: row.fetchedAt,
    },
  }
}

let hydration: Promise<void> | null = null

/** Load installed remote courses from IDB into memory (once). Idempotent. */
export function hydrateRemoteCourses(storage: StorageBackend): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      const rows = await storage.courses.list()
      let changed = false
      for (const row of rows) {
        const b = bundleFromRow(row)
        if (b) { remote.set(b.id, b); changed = true }
      }
      if (changed) bump()
    })()
  }
  return hydration
}

/** Persist + register a freshly-fetched remote course (install or refresh). */
export async function addRemoteCourse(storage: StorageBackend, row: InstalledCourseRow): Promise<CourseInfo | null> {
  await storage.courses.install(row)
  const b = bundleFromRow(row)
  if (!b) return null
  remote.set(b.id, b)
  bump()
  return toInfo(b)
}

/** Remove an installed remote course (storage + registry). */
export async function removeRemoteCourse(storage: StorageBackend, sourceId: string): Promise<void> {
  await storage.courses.remove(sourceId)
  if (remote.delete(sourceId)) bump()
}

// ---------------------------------------------------------------------------
// Merged read API (bundled + remote)
// ---------------------------------------------------------------------------

function getBundle(id: string): CourseBundle | undefined {
  return remote.get(id) ?? BUNDLED.get(id)
}

/** All courses (bundled + installed-remote), sorted by `order` then title. */
export function listCourses(): CourseInfo[] {
  return snapshot
}

/** A single course's metadata + ordered lesson ids + source, or undefined. */
export function getCourse(id: string): CourseInfo | undefined {
  const b = getBundle(id)
  return b ? toInfo(b) : undefined
}

/** A fully-loaded lesson, or undefined if the course/lesson id is unknown. */
export function getLesson(courseId: string, lessonId: string): Lesson | undefined {
  return getBundle(courseId)?.lessons.get(lessonId)
}

// ---------------------------------------------------------------------------
// Validation (before installing untrusted remote content)
// ---------------------------------------------------------------------------

/** Caps guard against a hostile/oversized repo (also basic abuse limits). */
const MAX_FILES = 1000
const MAX_LESSONS = 100
const MAX_TOTAL_BYTES = 8 * 1024 * 1024

const REGS = new Set(['a', 'x', 'y', 'sp', 'pc'])

function validCheck(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false
  const k = (c as { kind?: unknown }).kind
  const o = c as Record<string, unknown>
  switch (k) {
    case 'build': return true
    case 'label': return typeof o.name === 'string'
    case 'memory': return typeof o.addr === 'string' && typeof o.equals === 'string'
    case 'register': return typeof o.reg === 'string' && REGS.has(o.reg) && typeof o.equals === 'string'
    default: return false
  }
}

export interface CourseValidation {
  ok: boolean
  error?: string
}

/** Project-relative directories reserved for project-local *plugins*. Files
 *  here are loaded as code — `editors/*.js` via the editor registry, and
 *  `converters/*.js` via the recipe engine — both Blob-URL + dynamic-import
 *  EXECUTED on project load/build. Courses are data, not code (see
 *  wiki/decisions/2026-06-14-remote-courses-trust-model.md), so a course
 *  starter file must never land here, or merely opening the lesson would run
 *  the repo's arbitrary JS on our origin. */
const PLUGIN_DIRS = ['editors', 'converters']

/** True if a *project-relative* path falls inside a reserved plugin directory. */
export function isProjectPluginPath(projectPath: string): boolean {
  return PLUGIN_DIRS.includes(projectPath.split('/')[0] ?? '')
}

/** Structural validation of fetched course files before install. Rejects (with
 *  a message) rather than silently skipping, so the user learns why a repo
 *  didn't load. Courses are data, not code — this guards shape + size only. */
export function validateCourseFiles(files: { path: string; content: string }[]): CourseValidation {
  if (files.length > MAX_FILES) return { ok: false, error: `too many files (${files.length} > ${MAX_FILES})` }
  const total = files.reduce((n, f) => n + f.content.length, 0)
  if (total > MAX_TOTAL_BYTES) return { ok: false, error: `course too large (${Math.round(total / 1024)} KB)` }

  const courseJson = files.find((f) => f.path === 'course.json')
  if (!courseJson) return { ok: false, error: 'no course.json at the repo root' }
  let meta: CourseMeta
  try { meta = JSON.parse(courseJson.content) as CourseMeta } catch { return { ok: false, error: 'course.json is not valid JSON' } }
  if (typeof meta.title !== 'string' || !meta.title) return { ok: false, error: 'course.json: missing "title"' }
  if (typeof meta.machine !== 'string' || !meta.machine) return { ok: false, error: 'course.json: missing "machine"' }

  const lessonIds = new Set<string>()
  for (const f of files) {
    const m = f.path.match(/^lessons\/([^/]+)\//)
    if (m) lessonIds.add(m[1]!)
  }
  if (lessonIds.size === 0) return { ok: false, error: 'no lessons/ directory found' }
  if (lessonIds.size > MAX_LESSONS) return { ok: false, error: `too many lessons (${lessonIds.size} > ${MAX_LESSONS})` }

  // Courses are data, not code: a lesson starter file (lessons/<id>/files/<rest>)
  // must not land in a project plugin directory, where it would be executed on
  // load. Reject (don't silently strip) so the author learns why.
  for (const f of files) {
    const m = f.path.match(/^lessons\/[^/]+\/files\/(.+)$/)
    if (m && isProjectPluginPath(m[1]!)) {
      return { ok: false, error: `course may not ship plugin code: "${f.path}" — editors/ and converters/ are reserved for project-local plugins, not course content` }
    }
  }

  let withBody = 0
  for (const id of lessonIds) {
    if (files.some((f) => f.path === `lessons/${id}/lesson.md`)) withBody++
    const check = files.find((f) => f.path === `lessons/${id}/check.json`)
    if (check) {
      let parsed: { checks?: unknown }
      try { parsed = JSON.parse(check.content) as { checks?: unknown } } catch { return { ok: false, error: `lessons/${id}/check.json is not valid JSON` } }
      if (parsed.checks !== undefined) {
        if (!Array.isArray(parsed.checks) || !parsed.checks.every(validCheck)) {
          return { ok: false, error: `lessons/${id}/check.json has an invalid check` }
        }
      }
    }
  }
  if (withBody === 0) return { ok: false, error: 'no lesson has a lesson.md' }
  return { ok: true }
}
