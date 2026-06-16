import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  courseSourceId,
  fetchGitHubCourse,
  getCourse,
  getLesson,
  installCourseFromGitHub,
  listCourses,
  parseGitHubRef,
  refreshCourseFromGitHub,
  removeRemoteCourse,
  validateCourseFiles,
} from '@app'
import { __resetDb, createIdbStorage, listInstalledCourses } from '@adapters/storage-idb'

const storage = createIdbStorage()

// Remote course fetch + install (epic ecd5258). Network is mocked; the jsDelivr
// CDN shape is faked. fake-indexeddb backs the install persistence.

const COURSE_JSON = JSON.stringify({ title: 'Test Course', description: 'A test', machine: 'atari-xl' })
const LESSON_MD = '# First Lesson\n\nDo the thing.'
const PROJECT_JSON = JSON.stringify({ version: 2, name: 't', main: 'src/main.a65', machine: 'atari-xl', toolchain: 'mads' })
const CHECK_JSON = JSON.stringify({ checks: [{ kind: 'build' }, { kind: 'label', name: 'start' }] })

// A jsDelivr flat listing + per-file CDN responses for owner/repo on `main`.
function installMockFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes('data.jsdelivr.com')) {
      if (url.includes('@main')) {
        return new Response(
          JSON.stringify({
            version: 'deadbeef',
            files: [
              { name: '/course.json' },
              { name: '/README.md' }, // must be ignored (not course content)
              { name: '/lessons/01-first/lesson.md' },
              { name: '/lessons/01-first/files/project.json' },
              { name: '/lessons/01-first/check.json' },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('', { status: 404 }) // @master etc.
    }
    if (url.includes('cdn.jsdelivr.net')) {
      if (url.endsWith('/course.json')) return new Response(COURSE_JSON, { status: 200 })
      if (url.endsWith('/lesson.md')) return new Response(LESSON_MD, { status: 200 })
      if (url.endsWith('/project.json')) return new Response(PROJECT_JSON, { status: 200 })
      if (url.endsWith('/check.json')) return new Response(CHECK_JSON, { status: 200 })
      return new Response('', { status: 404 })
    }
    throw new Error(`unmocked fetch: ${url}`)
  }) as typeof fetch
}

describe('parseGitHubRef', () => {
  it('parses full github.com URLs', () => {
    expect(parseGitHubRef('https://github.com/me/course')).toEqual({ owner: 'me', repo: 'course', ref: undefined })
    expect(parseGitHubRef('https://github.com/me/course.git')).toEqual({ owner: 'me', repo: 'course', ref: undefined })
    expect(parseGitHubRef('https://github.com/me/course/tree/dev')).toEqual({ owner: 'me', repo: 'course', ref: 'dev' })
  })
  it('parses shorthand owner/repo[@ref]', () => {
    expect(parseGitHubRef('me/course')).toEqual({ owner: 'me', repo: 'course', ref: undefined })
    expect(parseGitHubRef('me/course@v1')).toEqual({ owner: 'me', repo: 'course', ref: 'v1' })
  })
  it('rejects non-GitHub input', () => {
    expect(parseGitHubRef('https://gitlab.com/me/course')).toBeNull()
    expect(parseGitHubRef('just-text')).toBeNull()
  })
  it('builds a stable source id', () => {
    expect(courseSourceId({ owner: 'me', repo: 'course' })).toBe('gh:me/course@default')
    expect(courseSourceId({ owner: 'me', repo: 'course', ref: 'v1' })).toBe('gh:me/course@v1')
  })
})

describe('validateCourseFiles', () => {
  const good = [
    { path: 'course.json', content: COURSE_JSON },
    { path: 'lessons/01-first/lesson.md', content: LESSON_MD },
    { path: 'lessons/01-first/check.json', content: CHECK_JSON },
  ]
  it('accepts a well-formed course', () => {
    expect(validateCourseFiles(good).ok).toBe(true)
  })
  it('rejects a missing course.json', () => {
    const r = validateCourseFiles(good.filter((f) => f.path !== 'course.json'))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/course\.json/)
  })
  it('rejects course.json without a machine', () => {
    const r = validateCourseFiles([{ path: 'course.json', content: JSON.stringify({ title: 'x', description: 'y' }) }, ...good.slice(1)])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/machine/)
  })
  it('rejects no lessons', () => {
    expect(validateCourseFiles([{ path: 'course.json', content: COURSE_JSON }]).ok).toBe(false)
  })
  it('rejects an invalid check', () => {
    const bad = [{ path: 'lessons/01-first/check.json', content: JSON.stringify({ checks: [{ kind: 'nope' }] }) }, good[0]!, good[1]!]
    const r = validateCourseFiles(bad)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid check/)
  })
  it('rejects a course shipping plugin code (editors/converters are not course content)', () => {
    for (const p of ['lessons/01-first/files/editors/evil.js', 'lessons/01-first/files/converters/evil.js']) {
      const r = validateCourseFiles([...good, { path: p, content: 'globalThis.__pwned = 1' }])
      expect(r.ok, p).toBe(false)
      expect(r.error).toMatch(/plugin code|editors|converters/)
    }
  })
  it('still accepts ordinary starter files under files/', () => {
    const r = validateCourseFiles([...good, { path: 'lessons/01-first/files/src/main.a65', content: '; ok\n' }])
    expect(r.ok).toBe(true)
  })
})

describe('fetchGitHubCourse', () => {
  beforeEach(() => installMockFetch())
  afterEach(() => vi.restoreAllMocks())

  it('fetches only course files, resolving the default branch', async () => {
    const { files, usedRef, resolvedRef } = await fetchGitHubCourse('me', 'course')
    expect(usedRef).toBe('main')
    expect(resolvedRef).toBe('deadbeef')
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual(['course.json', 'lessons/01-first/check.json', 'lessons/01-first/files/project.json', 'lessons/01-first/lesson.md'])
    expect(paths).not.toContain('README.md') // filtered out
  })
})

describe('installCourseFromGitHub', () => {
  beforeEach(async () => { await __resetDb(); installMockFetch() })
  afterEach(async () => { vi.restoreAllMocks(); await removeRemoteCourse(storage, 'gh:me/course@default') })

  it('installs, registers, and persists a remote course', async () => {
    const info = await installCourseFromGitHub(storage, 'https://github.com/me/course')
    expect(info.id).toBe('gh:me/course@default')
    expect(info.title).toBe('Test Course')
    expect(info.source.kind).toBe('github')
    expect(info.lessons).toEqual(['01-first'])

    // registered in the merged read API
    expect(getCourse('gh:me/course@default')?.title).toBe('Test Course')
    expect(getLesson('gh:me/course@default', '01-first')?.title).toBe('First Lesson')
    expect(listCourses().some((c) => c.id === 'gh:me/course@default')).toBe(true)

    // persisted to IDB
    const installed = await listInstalledCourses()
    expect(installed.find((c) => c.sourceId === 'gh:me/course@default')).toBeTruthy()
  })

  it('rejects a non-GitHub URL before fetching', async () => {
    await expect(installCourseFromGitHub(storage, 'https://gitlab.com/me/course')).rejects.toThrow(/GitHub/)
  })
})

describe('refreshCourseFromGitHub', () => {
  beforeEach(async () => { await __resetDb(); installMockFetch() })
  afterEach(async () => { vi.restoreAllMocks(); await removeRemoteCourse(storage, 'gh:me/course@main') })

  it('re-installs from the stored owner/repo/ref', async () => {
    const info = await refreshCourseFromGitHub(storage, { owner: 'me', repo: 'course', ref: 'main' })
    expect(info.id).toBe('gh:me/course@main')
    expect(info.title).toBe('Test Course')
    expect(info.lessons).toEqual(['01-first'])
  })
})
