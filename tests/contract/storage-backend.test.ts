import { beforeEach, describe } from 'vitest'
import 'fake-indexeddb/auto'
import { createMemoryStorage } from '@adapters/storage-memory'
import { __resetDb, createIdbStorage } from '@adapters/storage-idb'
import { assertStorageBackend } from './storage-backend.harness'

// Both adapters, one suite. ADR-0005: the contract harness proves IDB and
// memory agree — the guarantee any future remote / File System Access backend
// must also satisfy.

describe('StorageBackend contract — memory', () => {
  assertStorageBackend(() => createMemoryStorage())
})

describe('StorageBackend contract — IDB', () => {
  beforeEach(async () => {
    // Wipe IDB between tests: close the cached handle, then delete the database.
    await __resetDb()
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (idb) {
      await new Promise<void>((resolve) => {
        const req = idb.deleteDatabase('madside')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })
    }
  })

  assertStorageBackend(() => createIdbStorage())
})
