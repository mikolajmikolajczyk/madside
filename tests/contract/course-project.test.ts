import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { lessonNav, openLesson } from '@app/course-project'
import { addRemoteCourse, removeRemoteCourse } from '@app'
import { __resetDb, loadProject, saveFile, textToBytes } from '@adapters/storage-idb'
import type { InstalledCourseRow } from '@ports'

// Lesson → project instantiation (500f11c). Lessons become persistent
// per-lesson projects; re-opening reuses the same project so edits survive.

describe('lesson → project instantiation', () => {
  beforeEach(async () => {
    await __resetDb()
  })

  it('instantiates a lesson into a project stamped with its course identity', async () => {
    const id = await openLesson('atari-basics', '01-hello')
    const loaded = await loadProject(id)
    expect(loaded!.manifest.machine).toBe('atari-xl')
    expect(loaded!.manifest.course).toEqual({ id: 'atari-basics', lesson: '01-hello' })
    expect(loaded!.files.some((f) => f.path === 'src/main.a65')).toBe(true)
  })

  it('reuses the persisted lesson project and preserves edits on re-open', async () => {
    const id1 = await openLesson('atari-basics', '01-hello')
    // learner edits the source
    await saveFile(id1, 'src/main.a65', textToBytes('; my work\n'))
    const id2 = await openLesson('atari-basics', '01-hello')
    expect(id2).toBe(id1) // same project, not a fresh instantiation
    const loaded = await loadProject(id2)
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')!
    expect(new TextDecoder().decode(main.content)).toBe('; my work\n')
  })

  it('keeps lessons as distinct projects', async () => {
    const a = await openLesson('atari-basics', '01-hello')
    const b = await openLesson('atari-basics', '02-loops')
    expect(a).not.toBe(b)
  })

  it('rejects an unknown lesson', async () => {
    await expect(openLesson('atari-basics', 'nope')).rejects.toThrow(/unknown lesson/)
    await expect(openLesson('nope', '01-hello')).rejects.toThrow(/unknown lesson/)
  })

  it('strips course-supplied plugin code when instantiating a lesson (defense-in-depth)', async () => {
    // A course installed straight into the registry bypasses validateCourseFiles
    // (bundled courses, or anything already in IDB). Instantiation must still
    // never write executable editors/converters into the project.
    const row: InstalledCourseRow = {
      sourceId: 'gh:evil/course@main', kind: 'github', owner: 'evil', repo: 'course', ref: 'main', fetchedAt: 1,
      files: [
        { path: 'course.json', content: JSON.stringify({ title: 'Evil', machine: 'atari-xl' }) },
        { path: 'lessons/01/lesson.md', content: '# L1' },
        { path: 'lessons/01/files/project.json', content: JSON.stringify({ version: 2, name: 'l1', main: 'src/main.a65', machine: 'atari-xl', toolchain: 'mads' }) },
        { path: 'lessons/01/files/src/main.a65', content: '; ok\n' },
        { path: 'lessons/01/files/editors/evil.js', content: 'globalThis.__pwned = 1' },
        { path: 'lessons/01/files/converters/evil.js', content: 'globalThis.__pwned2 = 1' },
      ],
    }
    await addRemoteCourse(row)
    try {
      const pid = await openLesson('gh:evil/course@main', '01')
      const loaded = await loadProject(pid)
      const paths = loaded!.files.map((f) => f.path)
      expect(paths).toContain('src/main.a65')
      expect(paths.some((p) => p.startsWith('editors/') || p.startsWith('converters/'))).toBe(false)
    } finally {
      await removeRemoteCourse('gh:evil/course@main')
    }
  })

  it('computes prev/next navigation within a course', () => {
    expect(lessonNav('atari-basics', '01-hello')).toEqual({
      index: 0,
      total: 3,
      prev: undefined,
      next: '02-loops',
    })
    expect(lessonNav('atari-basics', '02-loops')).toEqual({
      index: 1,
      total: 3,
      prev: '01-hello',
      next: '03-color',
    })
    expect(lessonNav('atari-basics', '03-color')).toEqual({
      index: 2,
      total: 3,
      prev: '02-loops',
      next: undefined,
    })
  })
})
