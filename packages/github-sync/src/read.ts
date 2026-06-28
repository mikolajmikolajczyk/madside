// Read side of github-sync (#161): the whole repo tree in one recursive call +
// per-blob content via the blobs API (the Contents API caps content at ~1MB).
// Used to browse projects/courses and pull a subtree back.

import { fromBase64, ghGet, ghGetOrNull, type GhFetch } from './util'
import type { PushTarget, SyncFile } from './push'

export interface RepoTree {
  branch: string
  /** Head commit of the branch. */
  commitSha: string
  entries: { path: string; type: string; sha: string }[]
  truncated: boolean
}

interface RepoResp {
  default_branch: string
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
interface BlobResp {
  content: string
  encoding: string
}

/** The repo's full tree (recursive) at the branch head, or null if the repo /
 *  branch is empty (no commits). */
export async function getRepoTree(fetch: GhFetch, target: PushTarget): Promise<RepoTree | null> {
  const { owner, repo } = target
  const branch = target.branch ?? (await ghGet<RepoResp>(fetch, `/repos/${owner}/${repo}`)).default_branch
  const ref = await ghGetOrNull<RefObj>(fetch, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
  if (!ref) return null
  const commitSha = ref.object.sha
  const baseTree = (await ghGet<CommitObj>(fetch, `/repos/${owner}/${repo}/git/commits/${commitSha}`)).tree.sha
  const tree = await ghGet<TreeResp>(fetch, `/repos/${owner}/${repo}/git/trees/${baseTree}?recursive=1`)
  return { branch, commitSha, entries: tree.tree, truncated: tree.truncated }
}

/** Fetch one blob's bytes by sha (blobs API — no 1MB cap). */
export async function fetchBlob(fetch: GhFetch, target: PushTarget, sha: string): Promise<Uint8Array> {
  const blob = await ghGet<BlobResp>(fetch, `/repos/${target.owner}/${target.repo}/git/blobs/${sha}`)
  return fromBase64(blob.content)
}

/** Pull every blob under `basePath/` into course/project-root-relative files. */
export async function pullSubtree(
  fetch: GhFetch,
  target: PushTarget,
  tree: RepoTree,
  basePath: string,
): Promise<SyncFile[]> {
  const prefix = `${basePath}/`
  const blobs = tree.entries.filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
  return Promise.all(
    blobs.map(async (e) => ({ path: e.path.slice(prefix.length), content: await fetchBlob(fetch, target, e.sha) })),
  )
}
