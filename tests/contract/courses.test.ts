import { describe, expect, it } from 'vitest'
import { getCourse, getLesson, listCourses } from '@app/courses'

// Bundled-course foundation (3ed11be). Verifies the Vite glob loader picks up
// courses/<id>/ and CourseService exposes courses, lessons, starter files,
// checks, and solutions. No UI / instantiation here — those are later children.

describe('interactive courses', () => {
  it('lists the bundled courses with display metadata', () => {
    const list = listCourses()
    expect(list.map((c) => c.id)).toContain('atari-basics')
    const atari = list.find((c) => c.id === 'atari-basics')!
    expect(atari).toMatchObject({ machine: 'atari-xl', title: expect.stringContaining('Atari') })
    expect(atari.description.length).toBeGreaterThan(0)
  })

  it('orders lessons by their directory prefix', () => {
    const course = getCourse('atari-basics')
    expect(course).toBeDefined()
    expect(course!.lessons).toEqual(['01-hello', '02-loops', '03-color'])
  })

  it('returns undefined for unknown course / lesson ids', () => {
    expect(getCourse('nope')).toBeUndefined()
    expect(getLesson('atari-basics', 'nope')).toBeUndefined()
    expect(getLesson('nope', '01-hello')).toBeUndefined()
  })

  it('loads a lesson: title from the first heading, body, files, checks', () => {
    const lesson = getLesson('atari-basics', '01-hello')!
    expect(lesson.title).toBe('Hello, Atari')
    expect(lesson.body).toMatch(/SAVMSC/)
    // starter files include the manifest + the source under edit
    const paths = lesson.files.map((f) => f.path)
    expect(paths).toContain('project.json')
    expect(paths).toContain('src/main.a65')
    expect(lesson.files.find((f) => f.path === 'src/main.a65')!.content).toMatch(/TODO/)
    // checks are declarative
    expect(lesson.checks).toContainEqual({ kind: 'build' })
    expect(lesson.checks).toContainEqual({ kind: 'label', name: 'start' })
  })

  it('exposes a reference solution without the TODO', () => {
    const lesson = getLesson('atari-basics', '01-hello')!
    const sol = lesson.solution.find((f) => f.path === 'src/main.a65')
    expect(sol).toBeTruthy()
    expect(sol!.content).not.toMatch(/TODO/)
    expect(sol!.content).toMatch(/sta \(screen\),y/)
  })

  it('parses a memory check with hex operands', () => {
    const lesson = getLesson('atari-basics', '03-color')!
    expect(lesson.checks).toContainEqual({
      kind: 'memory',
      addr: '$02C6',
      equals: '$94',
      afterFrames: 2,
    })
  })
})
