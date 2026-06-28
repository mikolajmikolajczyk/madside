// Atomic push of a project (or course) subtree to a GitHub repo via the Git Data
// API (#160). One commit per push. The subtree at `basePath` is replaced
// WHOLESALE — rebuilt from the given files — so deletes/renames propagate
// (base_tree alone would inherit stale entries). Other paths (other projects,
// courses) are inherited untouched, so concurrent pushes to different subtrees
// compose for free; a concurrent push to the SAME subtree resolves last-writer-
// wins (commit on top, never a force/history-rewrite). No merge engine.

import {
  GitHubApiError,
  encodePath,
  ghGet,
  ghGetOrNull,
  ghPatchRef,
  ghPost,
  ghPut,
  gitBlobSha,
  toBase64,
  type GhFetch,
} from './util'

export interface SyncFile {
  /** Path relative to `basePath` (POSIX, no leading slash). */
  path: string
  content: Uint8Array
}

export interface PushTarget {
  owner: string
  repo: string
  /** Branch to update; defaults to the repo's default branch. */
  branch?: string
}

export interface PushResult {
  commitSha: string
  branch: string
  /** True when this push bootstrapped an empty repo / unborn branch. */
  created: boolean
}

interface RefObj {
  object: { sha: string }
}
interface CommitObj {
  tree: { sha: string }
}
interface TreeResp {
  sha: string
  tree: { path: string; type: string; sha: string }[]
  truncated: boolean
}
interface ShaResp {
  sha: string
}
interface RepoResp {
  default_branch: string
}

type TreeEntry = { path: string; mode: '100644'; type: 'blob'; sha: string | null }

const MAX_REF_RETRIES = 3

/** Push `files` into `basePath` (e.g. `projects/<slug>`) as one atomic commit. */
export async function pushFiles(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  files: SyncFile[],
  message: string,
): Promise<PushResult> {
  const { owner, repo } = target
  const branch = target.branch ?? (await ghGet<RepoResp>(fetch, `/repos/${owner}/${repo}`)).default_branch

  let bootstrapped = false
  for (let attempt = 0; attempt < MAX_REF_RETRIES + 1; attempt++) {
    const ref = await ghGetOrNull<RefObj>(fetch, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
    if (!ref) {
      // Empty repo: the Git Data API can't create objects (POST /git/blobs →
      // 409 "Git Repository is empty"). Seed the first commit via the Contents
      // API (which works on an empty repo + creates the branch), then loop: the
      // ref now exists and the normal wholesale push adds the rest. Never
      // creates the repo itself.
      await seedEmptyRepo(fetch, target, branch, basePath, files, message)
      bootstrapped = true
      continue
    }
    const headSha = ref.object.sha
    const baseTree = (await ghGet<CommitObj>(fetch, `/repos/${owner}/${repo}/git/commits/${headSha}`)).tree.sha
    const tree = await ghGet<TreeResp>(fetch, `/repos/${owner}/${repo}/git/trees/${baseTree}?recursive=1`)

    const entries = await buildEntries(fetch, target, basePath, files, tree)
    const newTree = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/trees`, {
      base_tree: baseTree,
      tree: entries,
    })
    const commit = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [headSha],
    })
    const ok = await ghPatchRef(fetch, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: commit.sha,
      force: false,
    })
    if (ok) return { commitSha: commit.sha, branch, created: bootstrapped }
    // 422 non-fast-forward: the ref moved under us → re-read head and rebuild
    // (re-parent). Composes for other subtrees; last-writer-wins for this one.
  }
  throw new Error('push failed: the branch kept moving (concurrent updates) — try again')
}

/** Rebuild the `basePath` subtree from `files`: add/replace every given file
 *  (reusing an existing blob when content is unchanged) and delete any old blob
 *  under the prefix that's gone. */
async function buildEntries(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  files: SyncFile[],
  tree: TreeResp,
): Promise<TreeEntry[]> {
  const { owner, repo } = target
  const prefix = `${basePath}/`

  const existingShas = new Set<string>()
  const existingSubtree = new Set<string>()
  // A truncated recursive tree (huge repo) can't be trusted for deletions or
  // blob reuse — fall back to add-only.
  if (!tree.truncated) {
    for (const e of tree.tree) {
      if (e.type !== 'blob') continue
      existingShas.add(e.sha)
      if (e.path.startsWith(prefix)) existingSubtree.add(e.path)
    }
  }

  const entries: TreeEntry[] = []
  const newPaths = new Set<string>()
  for (const f of files) {
    const path = prefix + f.path
    newPaths.add(path)
    const sha = await gitBlobSha(f.content)
    const blobSha = existingShas.has(sha)
      ? sha
      : (await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/blobs`, {
          content: toBase64(f.content),
          encoding: 'base64',
        })).sha
    entries.push({ path, mode: '100644', type: 'blob', sha: blobSha })
  }
  for (const path of existingSubtree) {
    if (!newPaths.has(path)) entries.push({ path, mode: '100644', type: 'blob', sha: null })
  }
  return entries
}

/** Delete a whole subtree (`basePath/`) in one atomic commit. Returns null if
 *  the subtree (or the repo) doesn't exist — nothing to do. Same stale-ref
 *  retry as pushFiles. Explicit action only ("Remove from GitHub"). */
export async function deleteSubtree(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  message: string,
): Promise<PushResult | null> {
  const { owner, repo } = target
  const branch = target.branch ?? (await ghGet<RepoResp>(fetch, `/repos/${owner}/${repo}`)).default_branch
  const prefix = `${basePath}/`

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const ref = await ghGetOrNull<RefObj>(fetch, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
    if (!ref) return null
    const headSha = ref.object.sha
    const baseTree = (await ghGet<CommitObj>(fetch, `/repos/${owner}/${repo}/git/commits/${headSha}`)).tree.sha
    const tree = await ghGet<TreeResp>(fetch, `/repos/${owner}/${repo}/git/trees/${baseTree}?recursive=1`)
    const entries: TreeEntry[] = tree.tree
      .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
      .map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: null }))
    if (entries.length === 0) return null

    const newTree = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/trees`, {
      base_tree: baseTree,
      tree: entries,
    })
    const commit = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: newTree.sha,
      parents: [headSha],
    })
    const ok = await ghPatchRef(fetch, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: commit.sha,
      force: false,
    })
    if (ok) return { commitSha: commit.sha, branch, created: false }
  }
  throw new Error('remove failed: the branch kept moving (concurrent updates) — try again')
}

/** Create the first commit on an empty repo via the Contents API (the Git Data
 *  API rejects object creation while the repo is empty: POST /git/blobs → 409
 *  "Git Repository is empty"). Writes a single seed file under basePath, which
 *  creates the branch; the caller then loops and the normal push fills in the
 *  rest. Never creates the repo itself. */
async function seedEmptyRepo(
  fetch: GhFetch,
  target: PushTarget,
  branch: string,
  basePath: string,
  files: SyncFile[],
  message: string,
): Promise<void> {
  const { owner, repo } = target
  const seed = files[0]
  if (!seed) throw new Error('nothing to push')
  const path = encodePath(`${basePath}/${seed.path}`)
  try {
    await ghPut(fetch, `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      content: toBase64(seed.content),
      branch,
    })
  } catch (e) {
    // The repo got its first commit elsewhere between our ref check and now
    // (409 ref exists / 422 file exists) — fine, the retry loop finds the ref
    // and pushes normally.
    if (!(e instanceof GitHubApiError) || (e.status !== 409 && e.status !== 422)) throw e
  }
}
