// Atomic push of a project (or course) subtree to a GitHub repo via the Git Data
// API (#160). One commit per push. The subtree at `basePath` is replaced
// WHOLESALE — rebuilt from the given files — so deletes/renames propagate
// (base_tree alone would inherit stale entries). Other paths (other projects,
// courses) are inherited untouched, so concurrent pushes to different subtrees
// compose for free; a concurrent push to the SAME subtree resolves last-writer-
// wins (commit on top, never a force/history-rewrite). No merge engine.

import {
  EMPTY_TREE_SHA,
  GitHubApiError,
  assertSafeTreePath,
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
  parents: { sha: string }[]
}
interface TreeResp {
  sha: string
  tree: { path: string; type: string; sha: string; mode: string }[]
  truncated: boolean
}
interface ShaResp {
  sha: string
}
interface RepoResp {
  default_branch: string
}

// We always send a FULL tree of real blob refs (no base_tree, no sha:null
// deletions — GitHub's Trees API 404s on null-sha entries here). Keepers reuse
// their existing mode/sha; new files are 100644.
type TreeEntry = { path: string; mode: string; type: 'blob'; sha: string }

const MAX_REF_RETRIES = 3

/** Recursive tree for a commit's tree sha, treating the canonical empty tree as
 *  "no files". GitHub 404s `GET /git/trees/<emptyTreeSha>`, so we both recognise
 *  the well-known sha AND fall back to empty on a 404 (defensive). */
async function readTree(fetch: GhFetch, target: PushTarget, treeSha: string): Promise<TreeResp> {
  const empty: TreeResp = { sha: treeSha, tree: [], truncated: false }
  if (treeSha === EMPTY_TREE_SHA) return empty
  const t = await ghGetOrNull<TreeResp>(fetch, `/repos/${target.owner}/${target.repo}/git/trees/${treeSha}?recursive=1`)
  return t ?? empty
}

export interface PushOptions {
  /** Amend (replace) the branch HEAD instead of adding a commit, but ONLY when
   *  HEAD equals this sha — i.e. the last commit is ours and untouched. Keeps
   *  repeated saves from piling up commits; safe cross-device (another device's
   *  HEAD won't match, so it appends instead). */
  amendIfHead?: string
}

/** Push `files` into `basePath` (e.g. `projects/<slug>`) as one atomic commit. */
export async function pushFiles(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  files: SyncFile[],
  message: string,
  opts: PushOptions = {},
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
    const headCommit = await ghGet<CommitObj>(fetch, `/repos/${owner}/${repo}/git/commits/${headSha}`)
    const tree = await readTree(fetch, target, headCommit.tree.sha)

    const entries = await buildFullTree(fetch, target, basePath, files, tree)
    // No base_tree: `entries` is the COMPLETE tree (keepers + this subtree's
    // files), so removed/renamed files simply aren't included — atomic, one commit.
    const newTree = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/trees`, {
      tree: entries,
    })
    // Amend only when HEAD is exactly our last commit (force-replace it); else
    // append a normal commit (and retry on a moved ref).
    const amend = !bootstrapped && !!opts.amendIfHead && headSha === opts.amendIfHead
    const parents = amend ? headCommit.parents.map((p) => p.sha) : [headSha]
    const commit = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: newTree.sha,
      parents,
    })
    const ok = await ghPatchRef(fetch, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: commit.sha,
      force: amend,
    })
    if (ok) return { commitSha: commit.sha, branch, created: bootstrapped }
    // 422 non-fast-forward: the ref moved under us → re-read head and rebuild
    // (re-parent). Composes for other subtrees; last-writer-wins for this one.
  }
  throw new Error('push failed: the branch kept moving (concurrent updates) — try again')
}

/** Build the COMPLETE repo tree: every existing blob OUTSIDE `basePath/`
 *  (preserved with its mode + sha — no upload) plus `files` under `basePath/`
 *  (blob reused when unchanged). Omitting a previously-present subtree file
 *  deletes it, with no base_tree and no null-sha entries. */
async function buildFullTree(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  files: SyncFile[],
  tree: TreeResp,
): Promise<TreeEntry[]> {
  const { owner, repo } = target
  const prefix = `${basePath}/`
  // A truncated recursive tree means we can't see the whole repo — a full-tree
  // rebuild would DROP the unseen files. Refuse rather than lose data.
  if (tree.truncated) throw new Error('repo tree is too large (truncated) — cannot push safely')

  const entries: TreeEntry[] = []
  const existingShas = new Set<string>()
  for (const e of tree.tree) {
    if (e.type !== 'blob') continue
    existingShas.add(e.sha)
    if (!e.path.startsWith(prefix)) {
      entries.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha }) // keep as-is
    }
  }
  for (const f of files) {
    const path = prefix + f.path
    assertSafeTreePath(path)
    const sha = await gitBlobSha(f.content)
    const blobSha = existingShas.has(sha)
      ? sha
      : (await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/blobs`, {
          content: toBase64(f.content),
          encoding: 'base64',
        })).sha
    entries.push({ path, mode: '100644', type: 'blob', sha: blobSha })
  }
  return entries
}

/** Delete a whole subtree (`basePath/`) in ONE atomic commit. Returns null if
 *  the subtree (or repo) doesn't exist — nothing to do. Explicit action only.
 *  Rebuilds the full tree from the keepers (no base_tree, no null-sha). */
export interface DeleteResult {
  commitSha: string
  branch: string
  /** Number of files removed. */
  deleted: number
}

export async function deleteSubtree(
  fetch: GhFetch,
  target: PushTarget,
  basePath: string,
  message: string,
): Promise<DeleteResult | null> {
  const { owner, repo } = target
  const branch = target.branch ?? (await ghGet<RepoResp>(fetch, `/repos/${owner}/${repo}`)).default_branch
  const prefix = `${basePath}/`

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const ref = await ghGetOrNull<RefObj>(fetch, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
    if (!ref) return null
    const headSha = ref.object.sha
    const baseTree = (await ghGet<CommitObj>(fetch, `/repos/${owner}/${repo}/git/commits/${headSha}`)).tree.sha
    const tree = await readTree(fetch, target, baseTree)
    if (tree.truncated) throw new Error('repo tree is too large (truncated) — cannot remove safely')

    const kept: TreeEntry[] = []
    let removed = 0
    for (const e of tree.tree) {
      if (e.type !== 'blob') continue
      if (e.path.startsWith(prefix)) removed++
      else kept.push({ path: e.path, mode: e.mode, type: 'blob', sha: e.sha })
    }
    if (removed === 0) return null

    // Emptying the repo → reference the canonical empty tree (an empty `tree: []`
    // POST is rejected as "Invalid tree info").
    const newTreeSha =
      kept.length === 0
        ? EMPTY_TREE_SHA
        : (await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/trees`, { tree: kept })).sha
    const commit = await ghPost<ShaResp>(fetch, `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: newTreeSha,
      parents: [headSha],
    })
    const ok = await ghPatchRef(fetch, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: commit.sha,
      force: false,
    })
    if (ok) return { commitSha: commit.sha, branch, deleted: removed }
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
  assertSafeTreePath(`${basePath}/${seed.path}`)
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
