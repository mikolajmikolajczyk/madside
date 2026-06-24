import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { createBlankProject, getTemplateManifestText, instantiateTemplate, listTemplates } from '@app/templates'
import { __resetDb, createIdbStorage, loadProject } from '@madside/storage-idb'

const storage = createIdbStorage()

// Bundled-template foundation (71acac1). Verifies the Vite glob loader picks up
// templates/<id>/ and the service instantiates them into storage.

describe('project templates', () => {
  beforeEach(async () => {
    await __resetDb()
  })

  it('lists the bundled templates with display metadata, ordered', () => {
    const list = listTemplates()
    expect(list.map((t) => t.id)).toEqual(['atari-hello', 'nes-hello', 'atari-130xe-bank', 'nes-apu-hello', 'nes-c-hello', 'atari-c-hello', 'nes-banking', 'c64-c-hello', 'c64-hello', 'empty', 'genesis-asm-hello', 'zx-asm-hello', 'zx-c-hello', 'zx128-banking'])
    expect(list[0]).toMatchObject({ machine: 'atari-xl', name: expect.stringContaining('Atari') })
    expect(list[1]).toMatchObject({ machine: 'nes' })
    expect(list[2]).toMatchObject({ id: 'atari-130xe-bank', machine: 'atari-xl' })
    expect(list[3]).toMatchObject({ id: 'nes-apu-hello', machine: 'nes' })
    expect(list[4]).toMatchObject({ id: 'nes-c-hello', machine: 'nes' })
    expect(list[5]).toMatchObject({ id: 'atari-c-hello', machine: 'atari-xl' })
    expect(list[6]).toMatchObject({ id: 'nes-banking', machine: 'nes' })
    expect(list[7]).toMatchObject({ id: 'c64-c-hello', machine: 'c64' })
    expect(list[8]).toMatchObject({ id: 'c64-hello', machine: 'c64' })
    expect(list[9]).toMatchObject({ id: 'empty', machine: 'atari-xl' })
    expect(list[10]).toMatchObject({ id: 'genesis-asm-hello', machine: 'genesis' })
    expect(list[11]).toMatchObject({ id: 'zx-asm-hello', machine: 'zx-spectrum' })
    expect(list[12]).toMatchObject({ id: 'zx-c-hello', machine: 'zx-spectrum' })
    expect(list[13]).toMatchObject({ id: 'zx128-banking', machine: 'zx128' })
    expect(list[0]!.description.length).toBeGreaterThan(0)
  })

  it('instantiates the empty template (used by File → New project)', async () => {
    const row = await instantiateTemplate(storage, 'empty', 'my-proj')
    expect(row.name).toBe('my-proj')
    const loaded = await loadProject(row.id)
    expect(loaded!.manifest.machine).toBe('atari-xl')
    expect(loaded!.files.some((f) => f.path === 'src/main.a65')).toBe(true)
  })

  it('getTemplateManifestText seeds the blank-project form', () => {
    const text = getTemplateManifestText('empty')
    expect(text).toBeDefined()
    expect(JSON.parse(text!)).toMatchObject({ machine: 'atari-xl', toolchain: 'mads' })
  })

  it('createBlankProject creates the empty files with a caller manifest', async () => {
    const manifest = JSON.stringify(
      { version: 2, name: 'blank-nes', main: 'src/main.a65', machine: 'nes', toolchain: 'mads' },
      null,
      2,
    )
    const row = await createBlankProject(storage, manifest)
    expect(row.name).toBe('blank-nes')
    const loaded = await loadProject(row.id)
    expect(loaded!.manifest.machine).toBe('nes') // caller manifest wins
    expect(loaded!.files.some((f) => f.path === 'src/main.a65')).toBe(true)
  })

  it('instantiates a template into storage as a loadable project', async () => {
    const row = await instantiateTemplate(storage, 'atari-hello')
    const loaded = await loadProject(row.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.manifest.machine).toBe('atari-xl')
    expect(loaded!.manifest.main).toBe('src/hello.a65')
    const paths = loaded!.files.map((f) => f.path).sort()
    expect(paths).toContain('src/hello.a65')
    expect(paths).toContain('src/atari.a65')
    expect(paths).toContain('project.json')
  })

  it('instantiates the NES template with iNES-producing source', async () => {
    const row = await instantiateTemplate(storage, 'nes-hello')
    const loaded = await loadProject(row.id)
    expect(loaded!.manifest.machine).toBe('nes')
    const main = loaded!.files.find((f) => f.path === 'src/nes-hello.a65')
    expect(main).toBeTruthy()
    expect(new TextDecoder().decode(main!.content)).toMatch(/opt h-/)
  })

  it('instantiates the Genesis template (clownassembler M68k)', async () => {
    const row = await instantiateTemplate(storage, 'genesis-asm-hello')
    const loaded = await loadProject(row.id)
    expect(loaded!.manifest.machine).toBe('genesis')
    expect(loaded!.manifest.toolchain).toBe('clownassembler')
    expect(loaded!.manifest.main).toBe('src/main.asm')
    const paths = loaded!.files.map((f) => f.path).sort()
    expect(paths).toContain('src/main.asm')
    expect(paths).toContain('src/genesis.inc')
  })

  it('honours a name override and rejects unknown ids', async () => {
    const row = await instantiateTemplate(storage, 'atari-hello', 'My Project')
    expect(row.name).toBe('My Project')
    await expect(instantiateTemplate(storage, 'nope')).rejects.toThrow(/unknown template/)
  })
})
