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
import type { InstalledCourseRow } from '@ports'

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

/** Stable id for an installed course — the registry course id + IDB key. */
export function courseSourceId(r: GitHubRef): string {
  return `gh:${r.owner}/${r.repo}@${r.ref ?? 'default'}`
}

interface JsdelivrFlat {
  version?: string
  files?: { name: string }[]
}

async function listFiles(owner: string, repo: string, ref: string): Promise<JsdelivrFlat | null> {
  const res = await fetch(`${DATA}/${owner}/${repo}@${encodeURIComponent(ref)}?structure=flat`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`jsDelivr listing failed (${res.status})`)
  return (await res.json()) as JsdelivrFlat
}

/** Fetch a course's files from GitHub via jsDelivr. Resolves the default branch
 *  (tries `main` then `master`) when no ref is given. Returns only the course
 *  files (`course.json` + `lessons/**`), course-root-relative. */
export async function fetchGitHubCourse(
  owner: string,
  repo: string,
  ref?: string,
): Promise<{ files: { path: string; content: string }[]; usedRef: string; resolvedRef?: string }> {
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

  const wanted = (listing.files ?? [])
    .map((f) => f.name.replace(/^\//, ''))
    .filter((p) => p === 'course.json' || p.startsWith('lessons/'))
  if (wanted.length === 0) throw new Error('repo has no course.json or lessons/ — is this a course repo?')

  const fetchRef = listing.version || usedRef
  const files = await Promise.all(
    wanted.map(async (path) => {
      const res = await fetch(`${CDN}/${owner}/${repo}@${encodeURIComponent(fetchRef)}/${path}`)
      if (!res.ok) throw new Error(`failed to fetch ${path} (${res.status})`)
      return { path, content: await res.text() }
    }),
  )
  return { files, usedRef, resolvedRef: listing.version }
}

/** Fetch + validate + install a course from a GitHub repo reference (URL or
 *  shorthand). Returns the installed CourseInfo. Throws with a user-facing
 *  message on a bad URL, a non-course repo, a validation failure, or a network
 *  error. Re-installing the same ref overwrites (this is also `refresh`). */
export async function installCourseFromGitHub(input: string): Promise<CourseInfo> {
  const parsed = parseGitHubRef(input)
  if (!parsed) throw new Error('not a GitHub repo URL (expected github.com/owner/repo or owner/repo)')

  const { files, resolvedRef } = await fetchGitHubCourse(parsed.owner, parsed.repo, parsed.ref)
  const valid = validateCourseFiles(files)
  if (!valid.ok) throw new Error(valid.error)

  const row: InstalledCourseRow = {
    sourceId: courseSourceId(parsed),
    kind: 'github',
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref ?? '',
    resolvedRef,
    fetchedAt: Date.now(),
    files,
  }
  const info = await addRemoteCourse(row)
  if (!info) throw new Error('course could not be assembled (no usable lessons)')
  return info
}

/** Re-fetch an installed GitHub course from its stored ref and overwrite it
 *  (preserving learner edits — only the course *definition* updates). Returns
 *  the refreshed CourseInfo. */
export async function refreshCourseFromGitHub(source: {
  owner: string
  repo: string
  ref: string
}): Promise<CourseInfo> {
  return installCourseFromGitHub(`${source.owner}/${source.repo}${source.ref ? `@${source.ref}` : ''}`)
}
