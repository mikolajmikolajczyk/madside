import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '@adapters/storage-memory'
import { exportProjectZip, importProjectZip } from '@app/project-zip'
import type { ProjectManifestV2 } from '@ports'

// Project ZIP I/O over the StorageBackend port (#16). Memory adapter, so this
// runs headless — no IDB.

const enc = new TextEncoder()
const dec = new TextDecoder()
const manifest: ProjectManifestV2 = {
  version: 2, name: 'zip-me', main: 'src/main.a65', machine: 'atari-xl', toolchain: 'mads',
}

describe('project ZIP round-trip', () => {
  it('exports a project and re-imports it with the same files (excluding generated/)', async () => {
    const s = createMemoryStorage()
    const row = await s.projects.create('zip-me', [
      { path: 'src/main.a65', content: enc.encode('; hello\n') },
      { path: 'generated/out.a65', content: enc.encode('; reproducible\n') },
    ], manifest)

    const zip = await exportProjectZip(s, row.id)
    expect(zip.length).toBeGreaterThan(0)

    const imported = await importProjectZip(s, zip, 'fallback')
    expect(imported.id).not.toBe(row.id)

    const loaded = await s.projects.load(imported.id)
    const paths = loaded!.files.map((f) => f.path).sort()
    expect(paths).toContain('src/main.a65')
    expect(paths).toContain('project.json')
    // generated/ is excluded from the zip — it's reproducible by the pipeline.
    expect(paths).not.toContain('generated/out.a65')
    expect(dec.decode(loaded!.files.find((f) => f.path === 'src/main.a65')!.content)).toBe('; hello\n')
    expect(loaded!.manifest.machine).toBe('atari-xl')
  })

  it('disambiguates the project name on an import collision', async () => {
    const s = createMemoryStorage()
    const row = await s.projects.create('zip-me', [
      { path: 'src/main.a65', content: enc.encode('; v1\n') },
    ], manifest)
    const zip = await exportProjectZip(s, row.id)

    // import into the same store, where "zip-me" already exists
    const dup = await importProjectZip(s, zip, 'fallback')
    expect(dup.name).toBe('zip-me (2)')
    expect((await s.projects.list())).toHaveLength(2)
  })

  it('throws when exporting a missing project', async () => {
    const s = createMemoryStorage()
    await expect(exportProjectZip(s, 'ghost')).rejects.toThrow(/not found/)
  })
})
