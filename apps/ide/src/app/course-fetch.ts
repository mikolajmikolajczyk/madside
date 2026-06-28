// Fetch a course from a public GitHub repo (epic ecd5258, child 5b8dde1).
// Phase 1 is GitHub-only with ZERO backend: the jsDelivr CDN serves GitHub repo
// files with permissive CORS, so the browser fetches directly — no proxy, no
// GitHub API rate limit.
//
//   list  : https://data.jsdelivr.com/v1/packages/gh/<owner>/<repo>@<ref>?structure=flat
//   files : https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path>
//
// Other forges (GitLab/Codeberg/self-hosted/Radicle) lack CORS on raw/archive
// endpoints and need a proxy — deferred to the Phase 2 backlog (8b96cf8).

import { addRemoteCourse, validateCourseFiles, type CourseInfo } from './courses'
import { NetworkError } from '@ports'
import type { InstalledCourseRow, StorageBackend } from '@ports'

export interface GitHubRef {
  owner: string
  repo: string
  /** Branch / tag / commit, or undefined for the default branch. */
  ref?: string
}

const DATA = 'https://data.jsdelivr.com/v1/packages/gh'
const CDN = 'https://cdn.jsdelivr.net/gh'

/** Parse `https://github.com/<owner>/<repo>[/tree/<ref>]`, a bare
 *  `<owner>/<repo>[@<ref>]`, or a github.com URL with `.git`. Returns null if
 *  it isn't recognisably a GitHub repo reference. */
export function parseGitHubRef(input: string): GitHubRef | null {
  const s = input.trim()
  if (!s) return null

  // Full github.com URL (with optional /tree/<ref> or /blob/<ref>).
  const url = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s]+))?\/?$/i)
  if (url) {
    return { owner: url[1]!, repo: url[2]!, ref: url[3] || undefined }
  }

  // Shorthand owner/repo[@ref].
  const short = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:@([^\s]+))?$/)
  if (short) {
    return { owner: short[1]!, repo: short[2]!, ref: short[3] || undefined }
  }
  return null
}

/** Stable id for an installed course — the registry course id + IDB key. A
 *  multi-course repo distinguishes each course by its `courses/<slug>/` folder
 *  (`#<slug>` fragment); a legacy single-course repo (root `course.json`) keeps
 *  the plain id for backward-compat with already-installed rows. */
export function courseSourceId(r: GitHubRef, slug?: string | null): string {
  const base = `gh:${r.owner}/${r.repo}@${r.ref ?? 'default'}`
  return slug ? `${base}#${slug}` : base
}

interface JsdelivrFlat {
  version?: string
  files?: { name: string }[]
}

async function listFiles(owner: string, repo: string, ref: string): Promise<JsdelivrFlat | null> {
  let res: Response
  try {
    res = await fetch(`${DATA}/${owner}/${repo}@${encodeURIComponent(ref)}?structure=flat`)
  } catch (e) {
    throw new NetworkError(`jsDelivr listing request failed`, e)
  }
  if (res.status === 404) return null
  if (!res.ok) throw new NetworkError(`jsDelivr listing failed (${res.status})`)
  return (await res.json()) as JsdelivrFlat
}

/** A single course discovered in a repo, with course-root-relative files. */
export interface FetchedCourse {
  /** The `courses/<slug>/` folder name, or null for a legacy root course. */
  slug: string | null
  files: { path: string; content: string }[]
}

/** Fetch every course in a GitHub repo via jsDelivr. Resolves the default branch
 *  (tries `main` then `master`) when no ref is given. Supports a multi-course
 *  repo (`courses/<slug>/course.json`) and, for backward-compat, a legacy
 *  single-course repo (root `course.json`). Files are returned course-root-
 *  relative (the `courses/<slug>/` prefix is stripped). */
export async function fetchGitHubCourse(
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ courses: FetchedCourse[]; usedRef: string; resolvedRef?: string }> {
  const candidates = ref ? [ref] : ['main', 'master']
  let listing: JsdelivrFlat | null = null
  let usedRef = ''
  for (const c of candidates) {
    listing = await listFiles(owner, repo, c)
    if (listing) { usedRef = c; break }
  }
  if (!listing) {
    throw new Error(ref ? `ref '${ref}' not found` : 'no main/master branch — specify a ref (owner/repo@branch)')
  }

  const all = (listing.files ?? []).map((f) => f.name.replace(/^\//, ''))

  // Multi-course: one course per `courses/<slug>/` that has a course.json.
  const slugs = new Set<string>()
  for (const p of all) {
    const m = p.match(/^courses\/([^/]+)\/course\.json$/)
    if (m) slugs.add(m[1]!)
  }

  const groups: { slug: string | null; prefix: string; paths: string[] }[] = []
  if (slugs.size > 0) {
    for (const slug of [...slugs].sort()) {
      const prefix = `courses/${slug}/`
      groups.push({
        slug,
        prefix,
        paths: all.filter((p) => p === `${prefix}course.json` || p.startsWith(`${prefix}lessons/`)),
      })
    }
  } else if (all.includes('course.json')) {
    // Legacy: the whole repo is one course at the root.
    groups.push({
      slug: null,
      prefix: '',
      paths: all.filter((p) => p === 'course.json' || p.startsWith('lessons/')),
    })
  }
  if (groups.length === 0) {
    throw new Error('no course.json (at the root or under courses/<slug>/) — is this a course repo?')
  }

  const fetchRef = listing.version || usedRef
  const fetchFile = async (path: string): Promise<string> => {
    let res: Response
    try {
      res = await fetch(`${CDN}/${owner}/${repo}@${encodeURIComponent(fetchRef)}/${path}`)
    } catch (e) {
      throw new NetworkError(`failed to fetch ${path}`, e)
    }
    if (!res.ok) throw new NetworkError(`failed to fetch ${path} (${res.status})`)
    return res.text()
  }

  const courses = await Promise.all(
    groups.map(async (g) => ({
      slug: g.slug,
      files: await Promise.all(
        g.paths.map(async (path) => ({ path: path.slice(g.prefix.length), content: await fetchFile(path) })),
      ),
    })),
  )
  return { courses, usedRef, resolvedRef: listing.version }
}

/** Fetch + validate + install every course in a GitHub repo (URL or shorthand).
 *  Returns the installed CourseInfo[] — one per `courses/<slug>/`, or one for a
 *  legacy root course. Throws with a user-facing message on a bad URL, a
 *  non-course repo, or a network error. A repo with some bad courses still
 *  installs the good ones; only an all-empty result throws. Re-installing the
 *  same ref overwrites (this is also `refresh`). */
export async function installCourseFromGitHub(storage: StorageBackend, input: string): Promise<CourseInfo[]> {
  const parsed = parseGitHubRef(input)
  if (!parsed) throw new Error('not a GitHub repo URL (expected github.com/owner/repo or owner/repo)')

  const { courses, resolvedRef } = await fetchGitHubCourse(parsed.owner, parsed.repo, parsed.ref)

  const installed: CourseInfo[] = []
  const errors: string[] = []
  const label = (slug: string | null, msg: string) => (slug ? `${slug}: ${msg}` : msg)

  for (const course of courses) {
    const valid = validateCourseFiles(course.files)
    if (!valid.ok) { errors.push(label(course.slug, valid.error ?? 'invalid course')); continue }

    const row: InstalledCourseRow = {
      sourceId: courseSourceId(parsed, course.slug),
      kind: 'github',
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref ?? '',
      resolvedRef,
      slug: course.slug ?? undefined,
      fetchedAt: Date.now(),
      files: course.files,
    }
    const info = await addRemoteCourse(storage, row)
    if (info) installed.push(info)
    else errors.push(label(course.slug, 'no usable lessons'))
  }

  if (installed.length === 0) {
    throw new Error(errors.length ? errors.join('; ') : 'no courses found')
  }
  return installed
}

/** Re-fetch an installed GitHub course from its stored ref and overwrite it
 *  (preserving learner edits — only the course *definition* updates). Refreshes
 *  every course the repo provides. Returns the refreshed CourseInfo[]. */
export async function refreshCourseFromGitHub(storage: StorageBackend, source: {
  owner: string
  repo: string
  ref: string
}): Promise<CourseInfo[]> {
  return installCourseFromGitHub(storage, `${source.owner}/${source.repo}${source.ref ? `@${source.ref}` : ''}`)
}
