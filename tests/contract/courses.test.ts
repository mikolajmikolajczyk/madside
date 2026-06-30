import { beforeAll, describe, expect, it } from 'vitest'
import { addRemoteCourse, getCourse, getLesson, listCourses } from '@app/courses'
import { createMemoryStorage } from '@adapters/storage-memory'

// Course read API (assembleCourse + getCourse/getLesson). Bundled courses were
// dropped (#168) — courses now install from GitHub or are authored locally — so
// this installs an in-memory fixture course and verifies the same machinery:
// metadata, lesson ordering, starter files, checks, and solutions.

const json = (o: unknown) => JSON.stringify(o)
const manifest = json({ version: 2, name: 'lesson', main: 'src/main.a65', machine: 'atari-xl', toolchain: 'mads' })

const FILES: { path: string; content: string }[] = [
  { path: 'course.json', content: json({ title: 'Atari Basics (fixture)', description: 'A short fixture course.', machine: 'atari-xl', order: 1 }) },
  // 01-hello — body, starter (with TODO), checks, solution
  { path: 'lessons/01-hello/lesson.md', content: '# Hello, Atari\n\nWrite to the screen via SAVMSC.' },
  { path: 'lessons/01-hello/files/project.json', content: manifest },
  { path: 'lessons/01-hello/files/src/main.a65', content: 'start\n  ; TODO: write your code here\n' },
  { path: 'lessons/01-hello/check.json', content: json({ checks: [{ kind: 'build' }, { kind: 'label', name: 'start' }] }) },
  { path: 'lessons/01-hello/solution/src/main.a65', content: 'start\n  lda #0\n  sta (screen),y\n' },
  // 02-loops
  { path: 'lessons/02-loops/lesson.md', content: '# Loops' },
  { path: 'lessons/02-loops/files/project.json', content: manifest },
  { path: 'lessons/02-loops/files/src/main.a65', content: 'start\n' },
  // 03-color — a memory check with hex operands
  { path: 'lessons/03-color/lesson.md', content: '# Colour' },
  { path: 'lessons/03-color/files/project.json', content: manifest },
  { path: 'lessons/03-color/files/src/main.a65', content: 'start\n' },
  { path: 'lessons/03-color/check.json', content: json({ checks: [{ kind: 'memory', addr: '$02C6', equals: '$94', afterFrames: 2 }] }) },
]

const ID = 'local:atari-basics-fixture'

describe('interactive courses', () => {
  beforeAll(async () => {
    await addRemoteCourse(createMemoryStorage(), { sourceId: ID, kind: 'local', fetchedAt: 0, files: FILES })
  })

  it('lists installed courses with display metadata', () => {
    const atari = listCourses().find((c) => c.id === ID)!
    expect(atari).toMatchObject({ machine: 'atari-xl', title: expect.stringContaining('Atari') })
    expect(atari.description.length).toBeGreaterThan(0)
  })

  it('orders lessons by their directory prefix', () => {
    expect(getCourse(ID)!.lessons).toEqual(['01-hello', '02-loops', '03-color'])
  })

  it('returns undefined for unknown course / lesson ids', () => {
    expect(getCourse('nope')).toBeUndefined()
    expect(getLesson(ID, 'nope')).toBeUndefined()
    expect(getLesson('nope', '01-hello')).toBeUndefined()
  })

  it('loads a lesson: title from the first heading, body, files, checks', () => {
    const lesson = getLesson(ID, '01-hello')!
    expect(lesson.title).toBe('Hello, Atari')
    expect(lesson.body).toMatch(/SAVMSC/)
    const paths = lesson.files.map((f) => f.path)
    expect(paths).toContain('project.json')
    expect(paths).toContain('src/main.a65')
    expect(lesson.files.find((f) => f.path === 'src/main.a65')!.content).toMatch(/TODO/)
    expect(lesson.checks).toContainEqual({ kind: 'build' })
    expect(lesson.checks).toContainEqual({ kind: 'label', name: 'start' })
  })

  it('exposes a reference solution without the TODO', () => {
    const lesson = getLesson(ID, '01-hello')!
    const sol = lesson.solution.find((f) => f.path === 'src/main.a65')
    expect(sol).toBeTruthy()
    expect(sol!.content).not.toMatch(/TODO/)
    expect(sol!.content).toMatch(/sta \(screen\),y/)
  })

  it('parses a memory check with hex operands', () => {
    const lesson = getLesson(ID, '03-color')!
    expect(lesson.checks).toContainEqual({ kind: 'memory', addr: '$02C6', equals: '$94', afterFrames: 2 })
  })
})
