import { describe, expect, it } from 'vitest'
import { createWorkbench } from '@app/createWorkbench'
import { createMemoryStorage } from '@adapters/storage-memory'
import { createNoopLogger, createBufferedLogger } from '@adapters/logger'
import type { Command, ProjectManifestV2 } from '@ports'

describe('createWorkbench', () => {
  const manifest = (name: string): ProjectManifestV2 => ({
    version: 2,
    name,
    main: 'src/main.a65',
    machine: 'atari-xl',
    toolchain: 'mads',
  })
  const seedFiles = [{ path: 'src/main.a65', content: new TextEncoder().encode('; minimal seed\n') }]

  it('instantiates without a DOM', () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
    })
    expect(wb.events).toBeDefined()
    expect(wb.commands).toBeDefined()
    expect(wb.plugins).toBeDefined()
    expect(wb.storage).toBeDefined()
    expect(wb.logger).toBeDefined()
  })

  it('round-trips a project via the memory StorageBackend', async () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
    })

    const row = await wb.storage.projects.create('hello', seedFiles, manifest('hello'))

    const loaded = await wb.storage.projects.load(row.id)
    expect(loaded).not.toBeNull()
    const main = loaded!.files.find((f) => f.path === 'src/main.a65')
    expect(new TextDecoder().decode(main!.content)).toBe('; minimal seed\n')

    const list = await wb.storage.projects.list()
    expect(list.map((p) => p.id)).toContain(row.id)
  })

  it('emits + receives typed events', () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
    })

    const seen: string[] = []
    const off = wb.events.on('project:switched', (payload) => seen.push(payload.projectId))
    wb.events.emit('project:switched', { projectId: 'demo' })
    wb.events.emit('project:switched', { projectId: 'other' })
    off()
    wb.events.emit('project:switched', { projectId: 'after-off' })

    expect(seen).toEqual(['demo', 'other'])
  })

  it('registers + runs a command', async () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
    })

    let ran = 0
    const cmd: Command = {
      id: 'demo.add',
      title: 'add',
      run: () => {
        ran += 1
      },
    }
    wb.commands.register(cmd)
    expect(wb.commands.has('demo.add')).toBe(true)

    await wb.commands.run('demo.add', { projectId: 'p1' })
    expect(ran).toBe(1)
  })

  it('registers + lists plugins with project shadowing', () => {
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: createNoopLogger(),
    })

    wb.plugins.register({
      plugin: { id: 'csv', kind: 'converter', name: 'csv builtin' },
      source: { origin: 'builtin' },
    })
    wb.plugins.register({
      plugin: { id: 'csv', kind: 'converter', name: 'csv project override' },
      source: { origin: 'project', path: 'converters/csv.js' },
    })

    const resolved = wb.plugins.get('converter', 'csv')
    expect(resolved?.name).toBe('csv project override')

    const list = wb.plugins.list('converter')
    expect(list).toHaveLength(1)
  })

  it('logs through the buffered logger and drains entries', () => {
    const buf = createBufferedLogger('test')
    const wb = createWorkbench({
      storage: createMemoryStorage(),
      logger: buf,
    })

    wb.logger.info('hello')
    wb.logger.warn('warn', { x: 1 })
    const child = wb.logger.child('child')
    child.error('boom', new Error('e'))

    const drained = buf.drain()
    expect(drained).toHaveLength(3)
    expect(drained[0]!.message).toBe('hello')
    expect(drained[2]!.scope).toBe('test.child')
    expect(buf.peek()).toHaveLength(0)
  })
})
