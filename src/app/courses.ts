// Bundled interactive courses (epic 2e9c7cc, child 3ed11be). Courses live in
// the repo-root `courses/<id>/` directory and are bundled at build time via
// Vite's glob import — the same mechanism as `templates/` (no separate repo,
// offline, always available). A course is an ordered set of lessons; each
// lesson carries theory + instructions (markdown), starter project files, an
// optional declarative check, and an optional reference solution.
//
//   courses/<id>/
//     course.json                 # { title, description, machine, order? }
//     lessons/<nn>-<slug>/
//       lesson.md                 # theory + instructions (first H1 = title)
//       files/<path>              # starter project files (project.json + src/*)
//       check.json                # { checks: CourseCheck[] }  (optional)
//       solution/<path>           # reference solution (optional)
//
// Lesson order is the sorted lesson-directory name (the `<nn>-` numeric prefix),
// so there is no second list to keep in sync with the directories on disk.
//
// This module is the loader + read API only. Lesson → project instantiation
// (child 500f11c), the lesson panel (30ba629) and the check runner (29540fd)
// build on top of it.

/** A declarative lesson check. The runner (child 29540fd) consumes these;
 *  authored as JSON in each lesson's check.json. Hex strings (e.g. "$0080")
 *  are used for addresses/values so assembly authors read them naturally. */
export type CourseCheck =
  | { kind: 'build' }
  | { kind: 'label'; name: string }
  | { kind: 'memory'; addr: string; equals: string; space?: string; afterFrames?: number }
  | { kind: 'register'; reg: 'a' | 'x' | 'y' | 'sp' | 'pc'; equals: string; afterFrames?: number }

/** course.json — the picker-facing course descriptor. */
export interface CourseMeta {
  /** Display title shown in the course picker. */
  title: string
  /** One-line summary of what the course teaches. */
  description: string
  /** Machine id the course targets (badge in the picker). */
  machine: string
  /** Sort hint for the listing (ascending; missing sorts last). */
  order?: number
}

/** A lesson's content, fully loaded. */
export interface Lesson {
  /** Lesson directory name, e.g. `01-hello`. Stable id within the course. */
  id: string
  /** Display title — the first `# ` heading in lesson.md, else the slug. */
  title: string
  /** Rendered-as-markdown theory + instructions. */
  body: string
  /** Starter project files (project.json + sources), project-root relative. */
  files: { path: string; content: string }[]
  /** Declarative checks for the lesson's task, empty for pure-theory lessons. */
  checks: CourseCheck[]
  /** Optional reference solution files, project-root relative. */
  solution: { path: string; content: string }[]
}

/** Course listing entry (metadata + lesson count, no lesson bodies). */
export interface CourseInfo extends CourseMeta {
  id: string
  /** Ordered lesson ids (directory names). */
  lessons: string[]
}

interface CourseBundle {
  id: string
  meta: CourseMeta
  lessons: Map<string, Lesson>
}

// Eager raw glob — keys are absolute repo-root paths, values the file text.
// Vite inlines these at build; vitest resolves them against the filesystem.
const RAW = import.meta.glob('/courses/**/*', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

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

function loadBundles(): Map<string, CourseBundle> {
  // courseId -> { meta?, lessons: lessonId -> accumulator }
  const acc = new Map<string, { meta?: CourseMeta; lessons: Map<string, LessonAcc> }>()
  const lessonAcc = (c: { lessons: Map<string, LessonAcc> }, id: string): LessonAcc => {
    let l = c.lessons.get(id)
    if (!l) {
      l = { files: [], solution: [] }
      c.lessons.set(id, l)
    }
    return l
  }

  for (const [key, content] of Object.entries(RAW)) {
    const rel = key.replace(/^\/courses\//, '')
    const parts = rel.split('/')
    const courseId = parts[0]
    if (!courseId || parts.length < 2) continue // stray file directly under courses/
    let c = acc.get(courseId)
    if (!c) {
      c = { lessons: new Map() }
      acc.set(courseId, c)
    }

    // /courses/<id>/course.json
    if (parts.length === 2 && parts[1] === 'course.json') {
      c.meta = JSON.parse(content) as CourseMeta
      continue
    }
    // /courses/<id>/lessons/<lessonId>/...
    if (parts[1] !== 'lessons' || parts.length < 4) continue
    const lessonId = parts[2]!
    const tail = parts.slice(3)
    const l = lessonAcc(c, lessonId)
    if (tail.length === 1 && tail[0] === 'lesson.md') {
      l.body = content
    } else if (tail.length === 1 && tail[0] === 'check.json') {
      const parsed = JSON.parse(content) as { checks?: CourseCheck[] }
      l.checks = parsed.checks ?? []
    } else if (tail[0] === 'files') {
      l.files.push({ path: tail.slice(1).join('/'), content })
    } else if (tail[0] === 'solution') {
      l.solution.push({ path: tail.slice(1).join('/'), content })
    }
  }

  const out = new Map<string, CourseBundle>()
  for (const [courseId, c] of acc) {
    if (!c.meta) continue // a course missing its descriptor is a packaging error — skip
    const lessons = new Map<string, Lesson>()
    for (const [lessonId, l] of [...c.lessons].sort(([a], [b]) => a.localeCompare(b))) {
      if (l.body == null) continue // a lesson with no lesson.md is incomplete — skip
      lessons.set(lessonId, {
        id: lessonId,
        title: firstHeading(l.body) ?? lessonId,
        body: l.body,
        files: [...l.files].sort((a, b) => a.path.localeCompare(b.path)),
        checks: l.checks ?? [],
        solution: [...l.solution].sort((a, b) => a.path.localeCompare(b.path)),
      })
    }
    if (lessons.size === 0) continue // no usable lessons — skip
    out.set(courseId, { id: courseId, meta: c.meta, lessons })
  }
  return out
}

const BUNDLES = loadBundles()

/** Courses available out of the box, sorted by `order` then title. */
export function listCourses(): CourseInfo[] {
  return [...BUNDLES.values()]
    .map((b) => ({ id: b.id, ...b.meta, lessons: [...b.lessons.keys()] }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title))
}

/** A single course's metadata + ordered lesson ids, or undefined if unknown. */
export function getCourse(id: string): CourseInfo | undefined {
  const b = BUNDLES.get(id)
  return b ? { id: b.id, ...b.meta, lessons: [...b.lessons.keys()] } : undefined
}

/** A fully-loaded lesson (body + starter files + checks + solution), or
 *  undefined if the course or lesson id is unknown. */
export function getLesson(courseId: string, lessonId: string): Lesson | undefined {
  return BUNDLES.get(courseId)?.lessons.get(lessonId)
}
