import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import type { Project, ProjectRepository } from '@ports'
import { createMemoryProjectRepository } from '@adapters/storage-memory'
import { __resetDb, createIdbProjectRepository } from '@adapters/storage-idb'

// Same suite, both adapters. ADR-0005: contract harnesses prove the
// implementations agree. M9-NES needs the same guarantee for any future
// remote / Fs Access adapter.

const baseProject = (id: string, content = '; minimal seed\n'): Project => ({
  id,
  name: `hello-${id}`,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  files: [
    {
      path: 'src/main.a65',
      content: new TextEncoder().encode(content),
      updatedAt: Date.now(),
    },
  ],
  manifest: {
    version: 2,
    name: `hello-${id}`,
    main: 'src/main.a65',
    machine: 'atari-xl',
    toolchain: 'mads',
  },
})

const suites: Array<[string, () => ProjectRepository]> = [
  ['MemoryProjectRepository', createMemoryProjectRepository],
  ['IdbProjectRepository', createIdbProjectRepository],
]

for (const [name, factory] of suites) {
  describe(`${name} — ProjectRepository contract`, () => {
    let repo: ProjectRepository

    beforeEach(async () => {
      // Reset IDB between tests — close the cached handle first, then wipe.
      await __resetDb()
      const indexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB
      if (indexedDB) {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase('madside')
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
      }
      repo = factory()
    })

    it('listProjects starts empty', async () => {
      const r = await repo.listProjects()
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toEqual([])
    })

    it('saveProject then loadProject round-trips id, name, files', async () => {
      const p = baseProject('p1')
      const saved = await repo.saveProject(p)
      expect(saved.ok).toBe(true)

      const loaded = await repo.loadProject('p1')
      expect(loaded.ok).toBe(true)
      if (!loaded.ok) return
      expect(loaded.value.id).toBe('p1')
      expect(loaded.value.name).toBe('hello-p1')
      const main = loaded.value.files.find((f) => f.path === 'src/main.a65')
      expect(main).toBeDefined()
      expect(new TextDecoder().decode(main!.content)).toBe('; minimal seed\n')
    })

    it('listProjects returns saved metadata', async () => {
      await repo.saveProject(baseProject('alpha'))
      await repo.saveProject(baseProject('beta'))
      const list = await repo.listProjects()
      expect(list.ok).toBe(true)
      if (list.ok) {
        const ids = list.value.map((m) => m.id).sort()
        expect(ids).toEqual(['alpha', 'beta'])
      }
    })

    it('loadProject for missing id returns an error result', async () => {
      const r = await repo.loadProject('ghost')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('storage')
    })

    it('deleteProject removes the project', async () => {
      await repo.saveProject(baseProject('to-delete'))
      const d = await repo.deleteProject('to-delete')
      expect(d.ok).toBe(true)
      const l = await repo.listProjects()
      if (l.ok) expect(l.value.find((m) => m.id === 'to-delete')).toBeUndefined()
    })

    it('snapshot + listSnapshots + restoreSnapshot round-trips file content', async () => {
      const p1 = baseProject('snap-test', '; v1\n')
      await repo.saveProject(p1)

      const s1 = await repo.snapshot('snap-test', 'first')
      expect(s1.ok).toBe(true)
      if (!s1.ok) return

      // mutate
      const p2 = baseProject('snap-test', '; v2 different content here\n')
      await repo.saveProject(p2)

      const list = await repo.listSnapshots('snap-test')
      expect(list.ok).toBe(true)
      if (list.ok) expect(list.value.length).toBeGreaterThanOrEqual(1)

      const restored = await repo.restoreSnapshot(s1.value.id)
      expect(restored.ok).toBe(true)

      const loaded = await repo.loadProject('snap-test')
      if (!loaded.ok) return
      const main = loaded.value.files.find((f) => f.path === 'src/main.a65')
      expect(new TextDecoder().decode(main!.content)).toBe('; v1\n')
    })
  })
}
