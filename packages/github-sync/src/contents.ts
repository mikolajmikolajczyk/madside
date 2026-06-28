// Single root-file read/upsert via the Contents API (#162 settings.json). NOT
// the wholesale Git-Trees path — used for one standalone file (e.g. settings.json
// at the repo root), where a subtree replace would be catastrophic. Works on an
// empty repo too (PUT creates the first commit + branch).

import { encodePath, fromBase64, ghGetOrNull, ghPut, toBase64, type GhFetch } from './util'
import type { PushTarget } from './push'

interface ContentsResp {
  content: string
  sha: string
  encoding: string
}

/** Read one file's bytes + blob sha by path, or null if absent. */
export async function getContentsFile(
  fetch: GhFetch,
  target: PushTarget,
  path: string,
): Promise<{ bytes: Uint8Array; sha: string } | null> {
  const r = await ghGetOrNull<ContentsResp>(
    fetch,
    `/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}`,
  )
  if (!r) return null
  return { bytes: fromBase64(r.content), sha: r.sha }
}

/** Create or update one file at `path` (one commit). */
export async function upsertContentsFile(
  fetch: GhFetch,
  target: PushTarget,
  path: string,
  content: Uint8Array,
  message: string,
): Promise<void> {
  const existing = await getContentsFile(fetch, target, path)
  await ghPut(fetch, `/repos/${target.owner}/${target.repo}/contents/${encodePath(path)}`, {
    message,
    content: toBase64(content),
    ...(existing ? { sha: existing.sha } : {}),
  })
}
