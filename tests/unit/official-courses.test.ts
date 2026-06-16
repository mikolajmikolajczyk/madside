import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOfficialCatalogue, officialCourseRef, officialCourseSourceId, OFFICIAL_COURSES_REPO } from '@app'
import { NetworkError } from '@ports'

// The welcome screen fetches the official catalogue (index.json) from the
// curated repo over jsDelivr. Network is mocked here.

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    return impl(url)
  }) as typeof fetch
}

afterEach(() => vi.restoreAllMocks())

const CATALOGUE = {
  version: 1,
  courses: [
    { id: 'madside-tour', title: 'The madside Tour', description: 'Learn madside', machine: 'atari-xl', ref: 'madside-tour-v1' },
    { id: 'bad-no-ref', title: 'Broken', description: 'x', machine: 'nes' }, // missing ref → filtered
  ],
}

describe('fetchOfficialCatalogue', () => {
  it('fetches index.json from the official repo and returns valid entries', async () => {
    let seen = ''
    mockFetch((url) => { seen = url; return new Response(JSON.stringify(CATALOGUE), { status: 200 }) })

    const courses = await fetchOfficialCatalogue()
    expect(seen).toContain(`gh/${OFFICIAL_COURSES_REPO}@main/index.json`)
    expect(courses).toHaveLength(1) // the ref-less entry is filtered out
    expect(courses[0]!.id).toBe('madside-tour')
    expect(courses[0]!.ref).toBe('madside-tour-v1')
  })

  it('throws NetworkError on a non-ok response', async () => {
    mockFetch(() => new Response('', { status: 404 }))
    await expect(fetchOfficialCatalogue()).rejects.toBeInstanceOf(NetworkError)
  })

  it('throws NetworkError when fetch itself fails', async () => {
    mockFetch(() => { throw new TypeError('network down') })
    await expect(fetchOfficialCatalogue()).rejects.toBeInstanceOf(NetworkError)
  })

  it('returns [] for a catalogue with no courses array', async () => {
    mockFetch(() => new Response(JSON.stringify({ version: 1 }), { status: 200 }))
    expect(await fetchOfficialCatalogue()).toEqual([])
  })
})

describe('official course ref helpers', () => {
  const c = { id: 'madside-tour', title: 'T', description: 'd', machine: 'atari-xl', ref: 'madside-tour-v1' }
  it('builds the owner/repo@ref install spec', () => {
    expect(officialCourseRef(c)).toBe(`${OFFICIAL_COURSES_REPO}@madside-tour-v1`)
  })
  it('builds the installed sourceId used to de-dupe', () => {
    expect(officialCourseSourceId(c)).toBe(`gh:${OFFICIAL_COURSES_REPO}@madside-tour-v1`)
  })
})
