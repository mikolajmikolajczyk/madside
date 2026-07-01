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
import { getRepoTree, fetchBlob, type GhFetch } from '@madside/github-sync'
import { NetworkError } from '@ports'
import type { InstalledCourseRow, StorageBackend } from '@ports'

const dec = new TextDecoder()

/** Find the courses in a flat path list — one per `courses/<slug>/` that has a
 *  course.json. A repo holds any number of courses under `courses/`; that is the
 *  single supported layout. Returns each course root's prefix + its paths
 *  (course.json + lessons/**). */
function discoverCourseGroups(all: string[]): { slug: string; prefix: string; paths: string[] }[] {
  const slugs = new Set<string>()
  for (const p of all) {
    const m = p.match(/^courses\/([^/]+)\/course\.json$/)
    if (m) slugs.add(m[1]!)
  }
  return [...slugs].sort().map((slug) => {
    const prefix = `courses/${slug}/`
    return { slug, prefix, paths: all.filter((p) => p === `${prefix}course.json` || p.startsWith(`${prefix}lessons/`)) }
  })
}

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
export function courseSourceId(r: GitHubRef, slug: string): string {
  // Identity is repo + course slug, ref-less: re-adding/refreshing at a different
  // ref updates the SAME entry (the ref is only a fetch pin). Every course lives
  // under `courses/<slug>/`, so a slug always exists.
  return `gh:${r.owner}/${r.repo}#${slug}`
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
  /** The `courses/<slug>/` folder name. */
  slug: string
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
  ghFetch?: GhFetch,
): Promise<{ courses: FetchedCourse[]; usedRef: string; resolvedRef?: string }> {
  // An explicit ref is tried as-is. For the common main↔master mixup we also try
  // the sibling default-branch name (so `@master` works on a `main` repo, and
  // vice versa) — but NOT for arbitrary tags, so pinned versions stay strict.
  const sibling = ref === 'master' ? 'main' : ref === 'main' ? 'master' : null
  const candidates = ref ? (sibling ? [ref, sibling] : [ref]) : ['main', 'master']
  let listing: JsdelivrFlat | null = null
  let usedRef = ''
  for (const c of candidates) {
    listing = await listFiles(owner, repo, c)
    if (listing) { usedRef = c; break }
  }
  // jsDelivr's flat listing lags a fresh push (its branch tree caches for a long
  // time) and 404s private repos — both leave us without a course list even
  // though the files themselves are reachable. Fall back to the GitHub API tree
  // (fresh; unauthenticated for public repos, authed for private).
  const all = listing ? (listing.files ?? []).map((f) => f.name.replace(/^\//, '')) : []
  const groups = listing ? discoverCourseGroups(all) : []
  if (!listing || groups.length === 0) {
    return fetchGitHubCourseViaTree(owner, repo, ghFetch)
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

/** Unauthenticated GitHub REST fetch — for listing PUBLIC course repos when
 *  jsDelivr's flat listing is stale and the user isn't signed in. */
const anonGhFetch: GhFetch = (url, init) =>
  fetch(url, { ...init, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', ...(init?.headers as Record<string, string> | undefined) } })

/** List a repo's courses via the GitHub API tree (fresh, unlike jsDelivr's
 *  cached flat listing), then read each file. Files come from the jsDelivr CDN
 *  pinned to the resolved commit (fresh + no API rate limit) for public repos;
 *  a private repo (authed) reads blobs through the API. */
async function fetchGitHubCourseViaTree(
  owner: string,
  repo: string,
  ghFetch?: GhFetch,
): Promise<{ courses: FetchedCourse[]; usedRef: string; resolvedRef?: string }> {
  const target = { owner, repo }
  const gf = ghFetch ?? anonGhFetch
  const tree = await getRepoTree(gf, target)
  if (!tree) {
    throw new Error(`couldn't load ${owner}/${repo} — not found, or it's private (sign in with the app installed on it)`)
  }
  if (tree.truncated) throw new Error(`${owner}/${repo} is too large to read in one request`)

  const blobSha = new Map(tree.entries.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]))
  const groups = discoverCourseGroups([...blobSha.keys()])
  if (groups.length === 0) {
    throw new Error('no courses found — a course repo holds one or more courses/<slug>/course.json')
  }

  // Public repos: read files via the CDN pinned to the exact commit (fresh, no
  // rate limit). Private (authed): read blobs through the API.
  const readFile = ghFetch
    ? (path: string) => fetchBlob(ghFetch, target, blobSha.get(path)!).then((b) => dec.decode(b))
    : async (path: string) => {
        const res = await fetch(`${CDN}/${owner}/${repo}@${encodeURIComponent(tree.commitSha)}/${path}`)
        if (!res.ok) throw new NetworkError(`failed to fetch ${path} (${res.status})`)
        return res.text()
      }

  const courses = await Promise.all(
    groups.map(async (g) => ({
      slug: g.slug,
      files: await Promise.all(g.paths.map(async (path) => ({ path: path.slice(g.prefix.length), content: await readFile(path) }))),
    })),
  )
  return { courses, usedRef: tree.branch, resolvedRef: tree.commitSha }
}

/** Fetch + validate + install every course in a GitHub repo (URL or shorthand).
 *  Returns the installed CourseInfo[] — one per `courses/<slug>/`, or one for a
 *  legacy root course. Throws with a user-facing message on a bad URL, a
 *  non-course repo, or a network error. A repo with some bad courses still
 *  installs the good ones; only an all-empty result throws. Re-installing the
 *  same ref overwrites (this is also `refresh`). */
export async function installCourseFromGitHub(storage: StorageBackend, input: string, ghFetch?: GhFetch, onlySlug?: string): Promise<CourseInfo[]> {
  const parsed = parseGitHubRef(input)
  if (!parsed) throw new Error('not a GitHub repo URL (expected github.com/owner/repo or owner/repo)')

  const { courses, resolvedRef } = await fetchGitHubCourse(parsed.owner, parsed.repo, parsed.ref, ghFetch)
  const wanted = onlySlug ? courses.filter((c) => c.slug === onlySlug) : courses

  const installed: CourseInfo[] = []
  const errors: string[] = []

  for (const course of wanted) {
    const valid = validateCourseFiles(course.files)
    if (!valid.ok) { errors.push(`${course.slug}: ${valid.error ?? 'invalid course'}`); continue }

    const row: InstalledCourseRow = {
      sourceId: courseSourceId(parsed, course.slug),
      kind: 'github',
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref ?? '',
      resolvedRef,
      slug: course.slug,
      fetchedAt: Date.now(),
      files: course.files,
    }
    const info = await addRemoteCourse(storage, row)
    if (info) installed.push(info)
    else errors.push(`${course.slug}: no usable lessons`)
  }

  if (installed.length === 0) {
    throw new Error(errors.length ? errors.join('; ') : 'no courses found')
  }
  return installed
}

/** Re-fetch an installed GitHub course and overwrite it (preserving learner edits
 *  — only the course *definition* updates). Refreshes just `slug` when given (so
 *  a multi-course repo doesn't re-install courses the learner didn't add). */
export async function refreshCourseFromGitHub(storage: StorageBackend, source: {
  owner: string
  repo: string
  ref: string
  slug?: string
}, ghFetch?: GhFetch): Promise<CourseInfo[]> {
  return installCourseFromGitHub(storage, `${source.owner}/${source.repo}${source.ref ? `@${source.ref}` : ''}`, ghFetch, source.slug)
}

/** Course metadata in a repo, without installing — drives the "which course?"
 *  picker when a repo holds several. */
export interface GitHubCoursePreview { slug: string; title: string; description: string; machine: string }
export async function previewGitHubCourses(input: string, ghFetch?: GhFetch): Promise<GitHubCoursePreview[]> {
  const parsed = parseGitHubRef(input)
  if (!parsed) throw new Error('not a GitHub repo URL (expected github.com/owner/repo or owner/repo)')
  const { courses } = await fetchGitHubCourse(parsed.owner, parsed.repo, parsed.ref, ghFetch)
  return courses.map((c) => {
    let title = c.slug, description = '', machine = ''
    const meta = c.files.find((f) => f.path === 'course.json')
    if (meta) {
      try {
        const m = JSON.parse(meta.content) as { title?: string; description?: string; machine?: string }
        title = m.title ?? c.slug
        description = m.description ?? ''
        machine = m.machine ?? ''
      } catch { /* keep slug fallback */ }
    }
    return { slug: c.slug, title, description, machine }
  })
}
