// Low-level GitHub Git Data API helpers (#160). Pure: every call goes through an
// injected `GhFetch` (the app passes a token-attaching fetch that targets
// api.github.com directly — the broker only mints the token). No octokit.

/** Token-attaching fetch (e.g. the gh-auth client's `fetch`). Absolute URL in. */
export type GhFetch = (input: string, init?: RequestInit) => Promise<Response>

export class GitHubApiError extends Error {
  readonly status: number
  readonly body?: string
  constructor(message: string, status: number, body?: string) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
    this.body = body
  }
}

const BASE = 'https://api.github.com'

/** GET that maps 404/409 (missing ref / empty repo) to null. */
export async function ghGetOrNull<T>(fetch: GhFetch, path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`)
  if (res.status === 404 || res.status === 409) return null
  if (!res.ok) throw new GitHubApiError(`GET ${path} → ${res.status}`, res.status, await safeText(res))
  return (await res.json()) as T
}

export async function ghGet<T>(fetch: GhFetch, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new GitHubApiError(`GET ${path} → ${res.status}`, res.status, await safeText(res))
  return (await res.json()) as T
}

export async function ghPost<T>(fetch: GhFetch, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new GitHubApiError(`POST ${path} → ${res.status}`, res.status, await safeText(res))
  return (await res.json()) as T
}

export async function ghPut<T>(fetch: GhFetch, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new GitHubApiError(`PUT ${path} → ${res.status}`, res.status, await safeText(res))
  return (await res.json()) as T
}

/** Encode each path segment but keep the slashes (for Contents API URLs). */
export function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

/** PATCH a ref. Returns false on 422 (non-fast-forward) so the caller can
 *  re-parent and retry; throws on other failures. */
export async function ghPatchRef(fetch: GhFetch, path: string, body: unknown): Promise<boolean> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 422) return false
  if (!res.ok) throw new GitHubApiError(`PATCH ${path} → ${res.status}`, res.status, await safeText(res))
  return true
}

async function safeText(res: Response): Promise<string> {
  return res.text().catch(() => '')
}

/** Base64-encode bytes (chunked to dodge call-stack limits on large assets). */
export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Git's blob object id: SHA-1 of `blob <bytelen>\0<content>`. Lets us reference
 *  an already-present blob in a new tree without re-uploading it. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const buf = new Uint8Array(header.length + bytes.length)
  buf.set(header, 0)
  buf.set(bytes, header.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
