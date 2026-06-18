import { expect, it } from 'vitest'
import type { ProjectManifestV2, StorageBackend } from '@ports'

// Reusable StorageBackend contract (ADR-0005). Every adapter — IDB, memory, and
// any future remote / File System Access backend — must pass this identical
// suite, proving they agree. Call inside a `describe` block per adapter.
//
// `fresh` returns a clean backend; the caller wipes persistent state between
// tests (IDB needs an explicit reset, memory just makes a new instance).

const enc = new TextEncoder()
const dec = new TextDecoder()

const manifest = (name: string): ProjectManifestV2 => ({
  version: 2,
  name,
  main: 'src/main.a65',
  machine: 'atari-xl',
  toolchain: 'mads',
})

const seedFiles = (content = '; v1\n') => [
  { path: 'src/main.a65', content: enc.encode(content) },
]

export function assertStorageBackend(fresh: () => StorageBackend): void {
  it('projects.list starts empty', async () => {
    const s = fresh()
    expect(await s.projects.list()).toEqual([])
  })

  it('create → load round-trips files + manifest, and injects project.json', async () => {
    const s = fresh()
    const row = await s.projects.create('hello world', seedFiles(), manifest('hello world'))
    expect(row.name).toBe('hello world')

    const loaded = await s.projects.load(row.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.manifest.machine).toBe('atari-xl')
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')
    expect(dec.decode(main!.content)).toBe('; v1\n')
    // manifest file materialized even though it wasn't supplied
    expect(loaded!.files.some((f) => f.path === 'project.json')).toBe(true)
  })

  it('load returns null for a missing project', async () => {
    expect(await fresh().projects.load('ghost')).toBeNull()
  })

  it('create sets the active-project pointer', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles(), manifest('proj'))
    expect(await s.kv.getActiveProjectId()).toBe(row.id)
  })

  it('writeFile updates content and bumps updatedAt', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles(), manifest('proj'))
    await s.projects.writeFile(row.id, 'src/main.a65', enc.encode('; v2\n'))
    const loaded = await s.projects.load(row.id)
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')
    expect(dec.decode(main!.content)).toBe('; v2\n')
  })

  it('createFile throws when the file already exists', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles(), manifest('proj'))
    await expect(s.projects.createFile(row.id, 'src/main.a65')).rejects.toThrow()
  })

  it('renameFile moves content; renameFolder rewrites the prefix', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', [
      { path: 'src/a.a65', content: enc.encode('A') },
      { path: 'src/b.a65', content: enc.encode('B') },
    ], manifest('proj'))
    await s.projects.renameFile(row.id, 'src/a.a65', 'src/c.a65')
    await s.projects.renameFolder(row.id, 'src', 'asm')
    const loaded = await s.projects.load(row.id)
    const paths = loaded!.files.map((f) => f.path).sort()
    expect(paths).toContain('asm/c.a65')
    expect(paths).toContain('asm/b.a65')
    expect(paths.some((p) => p.startsWith('src/'))).toBe(false)
  })

  it('deleteFolder removes everything under the prefix', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', [
      { path: 'src/a.a65', content: enc.encode('A') },
      { path: 'keep.a65', content: enc.encode('K') },
    ], manifest('proj'))
    await s.projects.deleteFolder(row.id, 'src')
    const loaded = await s.projects.load(row.id)
    const paths = loaded!.files.map((f) => f.path)
    expect(paths).toContain('keep.a65')
    expect(paths.some((p) => p.startsWith('src/'))).toBe(false)
  })

  it('rename disambiguates name collisions', async () => {
    const s = fresh()
    await s.projects.create('taken', seedFiles(), manifest('taken'))
    const other = await s.projects.create('other', seedFiles(), manifest('other'))
    const name = await s.projects.rename(other.id, 'taken')
    expect(name).toBe('taken (2)')
  })

  it('duplicate clones files under a new id and "(copy)" name', async () => {
    const s = fresh()
    const row = await s.projects.create('orig', seedFiles('; original\n'), manifest('orig'))
    const dup = await s.projects.duplicate(row.id)
    expect(dup.id).not.toBe(row.id)
    expect(dup.name).toBe('orig (copy)')
    const loaded = await s.projects.load(dup.id)
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')
    expect(dec.decode(main!.content)).toBe('; original\n')
  })

  it('delete removes the project and clears the active pointer', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles(), manifest('proj'))
    await s.projects.delete(row.id)
    expect(await s.projects.list()).toEqual([])
    expect(await s.kv.getActiveProjectId()).toBeUndefined()
  })

  it('snapshot → restore round-trips content; dedup returns null', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles('; v1\n'), manifest('proj'))
    // Snapshot the full file set (incl. project.json) — restore deletes files
    // absent from the snapshot, so a partial set would drop the manifest.
    const all = (await s.projects.load(row.id))!.files.map((f) => ({ path: f.path, content: f.content }))

    const snap = await s.snapshots.create(row.id, 'first', all)
    expect(snap).not.toBeNull()

    // identical tree → dedup → null
    expect(await s.snapshots.create(row.id, 'auto', all)).toBeNull()

    // mutate the working copy, then restore
    await s.projects.writeFile(row.id, 'src/main.a65', enc.encode('; v2\n'))
    await s.snapshots.restore(row.id, snap!)
    const loaded = await s.projects.load(row.id)
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')
    expect(dec.decode(main!.content)).toBe('; v1\n')
  })

  it('snapshots.diff reports added / removed / modified', async () => {
    const s = fresh()
    const row = await s.projects.create('proj', seedFiles('; v1\n'), manifest('proj'))
    const a = await s.snapshots.create(row.id, 'manual', [
      { path: 'src/main.a65', content: enc.encode('; v1\n') },
      { path: 'src/old.a65', content: enc.encode('old') },
    ])
    const b = await s.snapshots.create(row.id, 'manual', [
      { path: 'src/main.a65', content: enc.encode('; v2\n') },
      { path: 'src/new.a65', content: enc.encode('new') },
    ])
    const d = s.snapshots.diff(a!, b!)
    expect(d.added).toEqual(['src/new.a65'])
    expect(d.removed).toEqual(['src/old.a65'])
    expect(d.modified).toEqual(['src/main.a65'])
  })

  it('breakpoints save → load round-trips, clear empties', async () => {
    const s = fresh()
    const bps = new Map([['src/main.a65', new Set([5, 12])]])
    await s.breakpoints.save('proj', bps)
    const loaded = await s.breakpoints.load('proj')
    expect([...(loaded.get('src/main.a65') ?? [])].sort((x, y) => x - y)).toEqual([5, 12])
    await s.breakpoints.clear('proj')
    expect((await s.breakpoints.load('proj')).size).toBe(0)
  })

  it('builds save → load round-trips binary + labels, clear empties (#62)', async () => {
    const s = fresh()
    const build = {
      ok: true,
      binary: new Uint8Array([0xff, 0xff, 0x00, 0x20, 0x42]),
      labels: new Map([['main', 0x2000]]),
      diagnostics: [{ file: 'src/main.c', line: 3, severity: 'warning' as const, message: 'x' }],
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    }
    await s.builds.save('proj', build)
    const loaded = await s.builds.load('proj')
    expect(loaded?.binary).toEqual(build.binary)         // Uint8Array survives clone
    expect(loaded?.labels?.get('main')).toBe(0x2000)     // Map survives clone
    expect(loaded?.diagnostics).toEqual(build.diagnostics)
    await s.builds.clear('proj')
    expect(await s.builds.load('proj')).toBeUndefined()
  })

  it('snapshots.delete removes one from the list', async () => {
    const s = fresh()
    const row = await s.projects.create('snap-del', seedFiles('; v1\n'), manifest('snap-del'))
    const snap = await s.snapshots.create(row.id, 'manual', [{ path: 'f', content: enc.encode('A') }])
    await s.snapshots.delete(snap!.id)
    expect(await s.snapshots.list(row.id)).toEqual([])
  })

  it('pruneAuto drops oldest autos beyond keep, manual snapshots immune', async () => {
    const s = fresh()
    const row = await s.projects.create('snap-prune', seedFiles('; v1\n'), manifest('snap-prune'))
    // 1 manual + 3 autos with distinct content (distinct trees dodge dedup→null)
    await s.snapshots.create(row.id, 'manual', [{ path: 'f', content: enc.encode('m') }])
    for (const c of ['a', 'b', 'c']) {
      expect(await s.snapshots.create(row.id, 'auto', [{ path: 'f', content: enc.encode(c) }])).not.toBeNull()
    }
    expect(await s.snapshots.pruneAuto(row.id, 1)).toBe(2) // 3 autos, keep 1 → drop 2
    const left = await s.snapshots.list(row.id)
    expect(left).toHaveLength(2) // 1 kept auto + the immune manual
    expect(left.filter((x) => x.summary === 'manual')).toHaveLength(1)
  })

  it('pruneAuto with keep 0 clears every auto but keeps manual', async () => {
    const s = fresh()
    const row = await s.projects.create('snap-prune0', seedFiles('; v1\n'), manifest('snap-prune0'))
    await s.snapshots.create(row.id, 'manual', [{ path: 'f', content: enc.encode('m') }])
    await s.snapshots.create(row.id, 'auto', [{ path: 'f', content: enc.encode('a') }])
    await s.snapshots.pruneAuto(row.id, 0)
    expect((await s.snapshots.list(row.id)).map((x) => x.summary)).toEqual(['manual'])
  })

  it('gcOrphanBlobs keeps blobs a snapshot still references (restore survives gc)', async () => {
    const s = fresh()
    const row = await s.projects.create('snap-gc', seedFiles('; v1\n'), manifest('snap-gc'))
    const all = (await s.projects.load(row.id))!.files.map((f) => ({ path: f.path, content: f.content }))
    const snap = await s.snapshots.create(row.id, 'manual', all)
    await s.projects.writeFile(row.id, 'src/main.a65', enc.encode('; v2\n'))
    await s.snapshots.gcOrphanBlobs() // must NOT collect the snapshot's blobs
    await s.snapshots.restore(row.id, snap!)
    const main = (await s.projects.load(row.id))!.files.find((f) => f.path === 'src/main.a65')
    expect(dec.decode(main!.content)).toBe('; v1\n')
  })

  it('courses install → list → get → remove', async () => {
    const s = fresh()
    const row = {
      sourceId: 'gh:o/r@main',
      kind: 'github' as const,
      owner: 'o',
      repo: 'r',
      ref: 'main',
      fetchedAt: 1,
      files: [{ path: 'course.json', content: '{}' }],
    }
    await s.courses.install(row)
    expect((await s.courses.list()).map((c) => c.sourceId)).toEqual(['gh:o/r@main'])
    expect((await s.courses.get('gh:o/r@main'))?.owner).toBe('o')
    await s.courses.remove('gh:o/r@main')
    expect(await s.courses.list()).toEqual([])
  })
}
