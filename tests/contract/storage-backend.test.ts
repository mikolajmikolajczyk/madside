import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import type { ProjectManifestV2 } from '@ports'
import { sha256Hex } from '@core/hash'
import { createMemoryStorage } from '@adapters/storage-memory'
import { __resetDb, createIdbStorage } from '@adapters/storage-idb'
import { assertStorageBackend } from './storage-backend.harness'

async function wipeIdb(): Promise<void> {
  await __resetDb()
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!idb) return
  await new Promise<void>((resolve) => {
    const req = idb.deleteDatabase('madside')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

// Both adapters, one suite. ADR-0005: the contract harness proves IDB and
// memory agree — the guarantee any future remote / File System Access backend
// must also satisfy.

describe('StorageBackend contract — memory', () => {
  assertStorageBackend(() => createMemoryStorage())
})

describe('StorageBackend contract — IDB', () => {
  beforeEach(wipeIdb)

  assertStorageBackend(() => createIdbStorage())
})

// White-box: the restore silent-drop branch (snapshots.ts — `if (row)`) can't be
// reached through the port (gc never orphans a *referenced* blob), so we corrupt
// the blobs store directly and assert restore drops the unbacked file instead of
// throwing. IDB-specific; the memory adapter mirrors the same guard in code.
describe('IDB restoreSnapshot drops files whose blob is missing', () => {
  beforeEach(wipeIdb)

  const enc = new TextEncoder()
  const manifest: ProjectManifestV2 = {
    version: 2, name: 'wb', main: 'src/main.a65', machine: 'atari-xl', toolchain: 'mads',
  }

  function deleteBlob(hash: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const open = (globalThis as { indexedDB: IDBFactory }).indexedDB.open('madside')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('blobs', 'readwrite')
        tx.objectStore('blobs').delete(hash)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error as Error) }
      }
      open.onerror = () => reject(open.error as Error)
    })
  }

  it('restore skips the file (no throw) when its referenced blob is gone', async () => {
    const s = createIdbStorage()
    const row = await s.projects.create('wb', [{ path: 'src/main.a65', content: enc.encode('; v1\n') }], manifest)
    const all = (await s.projects.load(row.id))!.files.map((f) => ({ path: f.path, content: f.content }))
    const snap = await s.snapshots.create(row.id, 'manual', all)

    // Orphan just main.a65's blob — project.json's blob stays so the project
    // still loads, isolating the silent-drop of the one unbacked file.
    await deleteBlob(await sha256Hex(enc.encode('; v1\n')))
    await s.projects.writeFile(row.id, 'src/main.a65', enc.encode('; v2\n'))
    await expect(s.snapshots.restore(row.id, snap!)).resolves.toBeUndefined()

    const loaded = await s.projects.load(row.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.files.some((f) => f.path === 'src/main.a65')).toBe(false)
  })

  function putRawProject(value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const open = (globalThis as { indexedDB: IDBFactory }).indexedDB.open('madside')
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('projects', 'readwrite')
        tx.objectStore('projects').put(value)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error as Error) }
      }
      open.onerror = () => reject(open.error as Error)
    })
  }

  it('quarantines a structurally-corrupt project row on load (#12)', async () => {
    const s = createIdbStorage()
    await s.projects.list() // open + create the schema (stores) before raw write
    // A row whose envelope is malformed (name is a number) — must not flow into
    // typed state; load throws StorageError instead.
    await putRawProject({ id: 'broken', name: 123, createdAt: 1, updatedAt: 1 })
    await expect(s.projects.load('broken')).rejects.toThrow(/corrupt project row/)
  })
})
