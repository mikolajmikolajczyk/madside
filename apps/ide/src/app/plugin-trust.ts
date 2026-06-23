// Project-local plugin trust (ADR-0013 P1). Editors (`editors/*.js`) and
// converters (`converters/*.js`) ship inside a project and execute on our origin,
// so they run only after the user consents — keyed on the *content* hash, not the
// path or channel, and persisted globally (storage.kv). Re-importing the same code
// (same hash) never re-prompts; changed code (new hash) does.
//
// The in-memory trusted set is a subscribe/snapshot store (ADR-0007
// useSyncExternalStore style, mirroring the course registry) so editor + converter
// gates re-evaluate the moment the user trusts something. Persistence is the source
// of truth across sessions; this set is the hydrated, reactive view of it.

import { sha256Hex } from '@core/hash'
import type { StorageBackend } from '@ports'

/** A project-relative path is a project-local plugin iff it's `editors/x.js` or
 *  `converters/x.js` (one level deep, `.js`). Same shape the editor + converter
 *  registries match on. */
export const PLUGIN_FILE_RE = /^(editors|converters)\/[^/]+\.js$/

export interface PluginSource { path: string; content: string }
/** A project-local plugin with its consent key (sha256 of its source). */
export interface PluginRef { path: string; hash: string }

const trusted = new Set<string>()
let snapshot: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

function bump(): void {
  snapshot = new Set(trusted)
  for (const l of listeners) l()
}

/** Subscribe to trust-set changes (hydrate / new consent). */
export function subscribeTrustedPlugins(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Stable snapshot for useSyncExternalStore — same reference until a change. */
export function trustedPluginsSnapshot(): ReadonlySet<string> {
  return snapshot
}

let hydrated = false
/** Load persisted trusted hashes into the reactive set once per session. */
export async function hydrateTrustedPlugins(storage: StorageBackend): Promise<void> {
  if (hydrated) return
  hydrated = true
  for (const h of await storage.kv.getTrustedPluginHashes()) trusted.add(h)
  bump()
}

/** True if this hash is in the (hydrated) trusted set — synchronous, for gates. */
export function isTrustedHash(hash: string): boolean {
  return snapshot.has(hash)
}

/** Record consent for a plugin's content hash (persist + update the reactive set).
 *  Idempotent. */
export async function trustPluginHash(storage: StorageBackend, hash: string): Promise<void> {
  if (trusted.has(hash)) return
  trusted.add(hash)
  await storage.kv.addTrustedPluginHash(hash)
  bump()
}

/** sha256 hex of a plugin source — the consent key. */
export function pluginHash(content: string | Uint8Array): Promise<string> {
  return sha256Hex(content)
}

/** The project-local plugin files among a project's files. */
export function pluginFiles<T extends { path: string }>(files: readonly T[]): T[] {
  return files.filter((f) => PLUGIN_FILE_RE.test(f.path))
}

/** Split plugin sources into the trusted ones (safe to load) and the untrusted
 *  ones (surface for consent). Hashes each against the current trusted snapshot. */
export async function partitionPlugins(
  sources: readonly PluginSource[],
): Promise<{ trusted: PluginSource[]; untrusted: PluginRef[] }> {
  const ok: PluginSource[] = []
  const blocked: PluginRef[] = []
  for (const s of sources) {
    const hash = await pluginHash(s.content)
    if (isTrustedHash(hash)) ok.push(s)
    else blocked.push({ path: s.path, hash })
  }
  return { trusted: ok, untrusted: blocked }
}

/** Drop project-local converter files the user hasn't consented to, so a build
 *  only runs trusted converters (ADR-0013). Hydrates first so trust state is
 *  authoritative regardless of init order; non-converter files pass through. */
export async function filterTrustedConverterFiles<T extends { path: string; content: Uint8Array }>(
  storage: StorageBackend,
  files: readonly T[],
): Promise<T[]> {
  await hydrateTrustedPlugins(storage)
  const out: T[] = []
  for (const f of files) {
    if (/^converters\/[^/]+\.js$/.test(f.path) && !isTrustedHash(await pluginHash(f.content))) continue
    out.push(f)
  }
  return out
}

/** The untrusted project-local plugins among a project's files — drives the
 *  consent prompt. Hydrates first so the list reflects persisted trust. */
export async function untrustedPlugins(
  storage: StorageBackend,
  files: readonly { path: string; content: Uint8Array }[],
): Promise<PluginRef[]> {
  await hydrateTrustedPlugins(storage)
  const out: PluginRef[] = []
  for (const f of pluginFiles(files)) {
    const hash = await pluginHash(f.content)
    if (!isTrustedHash(hash)) out.push({ path: f.path, hash })
  }
  return out
}
