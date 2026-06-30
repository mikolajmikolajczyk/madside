// Official course catalogue. madside ships a built-in pointer to one curated,
// public GitHub repo; its `index.json` (on the default branch) lists the courses
// madside surfaces by default on the welcome screen. Each entry names a `ref`
// (tag / commit — immutable, so jsDelivr serves fresh content) holding that
// course. Adding a course is a repo-only change: push it + add an index entry.

import { NetworkError } from '@ports'

export interface OfficialCourse {
  id: string
  title: string
  description: string
  machine: string
  /** The `courses/<slug>/` folder in the catalogue repo holding this course. */
  slug: string
}

/** The curated repo. Public — jsDelivr (the zero-backend CDN) serves it. */
export const OFFICIAL_COURSES_REPO = 'mikolajmikolajczyk/madside-courses'

const CATALOGUE_URL = `https://cdn.jsdelivr.net/gh/${OFFICIAL_COURSES_REPO}@main/index.json`

/** Fetch the official catalogue. Throws NetworkError on a transport failure so
 *  the caller can choose to swallow it (welcome should still render offline). */
export async function fetchOfficialCatalogue(): Promise<OfficialCourse[]> {
  let res: Response
  try {
    // no-store: don't let the browser serve a stale catalogue (e.g. a cached 503
    // or a pre-update index.json) — always revalidate against the CDN edge.
    res = await fetch(CATALOGUE_URL, { cache: 'no-store' })
  } catch (e) {
    throw new NetworkError('could not reach the official course catalogue', e)
  }
  if (!res.ok) throw new NetworkError(`official course catalogue failed (${res.status})`)
  const data = (await res.json()) as { courses?: OfficialCourse[] }
  return (data.courses ?? []).filter(
    (c): c is OfficialCourse => !!c && typeof c.id === 'string' && typeof c.slug === 'string' && typeof c.title === 'string',
  )
}

/** The repo spec madside installs official courses from — the catalogue repo
 *  (multi-course); the specific course is selected by `slug` at install. */
export function officialCourseRef(): string {
  return OFFICIAL_COURSES_REPO
}

/** The installed-course sourceId an official course resolves to once added, so
 *  the welcome screen can hide ones the learner already installed. */
export function officialCourseSourceId(c: OfficialCourse): string {
  return `gh:${OFFICIAL_COURSES_REPO}#${c.slug}`
}
