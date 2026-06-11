import { describe, expect, it } from 'vitest'
import { createWorkbench } from '@app/createWorkbench'
import { createMemoryProjectRepository } from '@adapters/storage-memory'
import { createNoopLogger, createBufferedLogger } from '@adapters/logger'
import type { Command, Project } from '@ports'

describe('createWorkbench', () => {
  const baseProject = (id: string): Project => ({
    id,
    name: `hello-${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: [
      {
        path: 'src/main.a65',
        content: new TextEncoder().encode('; minimal seed\n'),
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

  it('instantiates without a DOM', () => {
    const wb = createWorkbench({
      projectRepo: createMemoryProjectRepository(),
      logger: createNoopLogger(),
    })
    expect(wb.events).toBeDefined()
    expect(wb.commands).toBeDefined()
    expect(wb.plugins).toBeDefined()
    expect(wb.projects).toBeDefined()
    expect(wb.logger).toBeDefined()
  })

  it('round-trips a project via the memory ProjectRepository', async () => {
    const wb = createWorkbench({
      projectRepo: createMemoryProjectRepository(),
      logger: createNoopLogger(),
    })

    const project = baseProject('p1')
    const saved = await wb.projects.saveProject(project)
    expect(saved.ok).toBe(true)

    const loaded = await wb.projects.loadProject('p1')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.value.id).toBe('p1')
    expect(loaded.value.files).toHaveLength(1)
    expect(new TextDecoder().decode(loaded.value.files[0]!.content)).toBe('; minimal seed\n')

    const list = await wb.projects.listProjects()
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.value.map((p) => p.id)).toContain('p1')
  })

  it('emits + receives typed events', () => {
    const wb = createWorkbench({
      projectRepo: createMemoryProjectRepository(),
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
      projectRepo: createMemoryProjectRepository(),
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
      projectRepo: createMemoryProjectRepository(),
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
      projectRepo: createMemoryProjectRepository(),
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
