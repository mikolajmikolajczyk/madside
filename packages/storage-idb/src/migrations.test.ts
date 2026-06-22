// Exercises the migration runner without going through openDB — we hand it
// a fake `IDBPDatabase` shape that only implements the calls the runner
// uses. Keeps the test free of fake-indexeddb plumbing.

import { describe, expect, it } from 'vitest'
import { applyBaseline, latestVersion, migrations, runUpgrade, type Migration } from './migrations'

type Store = { keyPath: string | string[]; indexes: Set<string> }

class FakeDb {
  stores = new Map<string, Store>()
  get objectStoreNames(): readonly string[] {
    return [...this.stores.keys()]
  }
  createObjectStore(name: string, opts: { keyPath: string | string[] }) {
    if (this.stores.has(name)) throw new Error(`store exists: ${name}`)
    this.stores.set(name, { keyPath: opts.keyPath, indexes: new Set() })
    return {
      createIndex: (idx: string) => {
        this.stores.get(name)!.indexes.add(idx)
      },
    }
  }
  deleteObjectStore(name: string) {
    this.stores.delete(name)
  }
}

const v2Stores = ['projects', 'files', 'meta', 'snapshots', 'blobs', 'breakpoints']
// After applyBaseline + every migration runs (v3 adds courses, v4 adds builds).
const latestStores = [...v2Stores, 'courses', 'builds']

describe('IDB migration runner', () => {
  it('applyBaseline creates every v2 store with the expected indexes', () => {
    const db = new FakeDb()
    applyBaseline(db as never)
    expect([...db.stores.keys()].sort()).toEqual([...v2Stores].sort())
    expect(db.stores.get('projects')!.indexes.has('byUpdatedAt')).toBe(true)
    expect(db.stores.get('files')!.indexes.has('byProject')).toBe(true)
    expect(db.stores.get('snapshots')!.indexes.has('byProject')).toBe(true)
  })

  it('runUpgrade from oldVersion=0 applies the baseline then all migrations', () => {
    const db = new FakeDb()
    runUpgrade(db as never, 0, undefined as never)
    expect([...db.stores.keys()].sort()).toEqual([...latestStores].sort())
  })

  it('runUpgrade from oldVersion=1 tears down legacy stores then applies baseline + migrations', () => {
    const db = new FakeDb()
    // Simulate a pre-v2 install with one stale store.
    db.stores.set('legacy', { keyPath: 'id', indexes: new Set() })
    runUpgrade(db as never, 1, undefined as never)
    expect(db.stores.has('legacy')).toBe(false)
    expect([...db.stores.keys()].sort()).toEqual([...latestStores].sort())
  })

  it('runUpgrade from v2 only runs migrations whose v > oldVersion', () => {
    const db = new FakeDb()
    applyBaseline(db as never)
    const calls: number[] = []
    const original = migrations.slice()
    const fake: Migration[] = [
      { v: 3, description: 'test', run: () => { calls.push(3) } },
      { v: 4, description: 'test', run: () => { calls.push(4) } },
    ]
    migrations.length = 0
    migrations.push(...fake)
    try {
      runUpgrade(db as never, 3, undefined as never)
      expect(calls).toEqual([4]) // skipped v3, ran v4
    } finally {
      migrations.length = 0
      migrations.push(...original)
    }
  })

  it('latestVersion reports max(2, ...migrations[].v)', () => {
    expect(latestVersion()).toBe(2 + migrations.length === 2 ? 2 : Math.max(2, ...migrations.map((m) => m.v)))
    const original = migrations.slice()
    migrations.push({ v: 7, description: 'test', run: () => undefined })
    try {
      expect(latestVersion()).toBe(7)
    } finally {
      migrations.length = 0
      migrations.push(...original)
    }
  })
})
