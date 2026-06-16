import { describe, expect, it } from 'vitest'
import { createBuildService, createEventBus, type ToolchainAssembleFn } from '@services'
import { MANIFEST_VERSION, type ProjectManifestV2, type WorkbenchEvents } from '@ports'

// BuildService event surface. Regression cover for the dogfooding fix where a
// failed build showed only "assemble exit 1": build:error must carry the
// assembler's stdout/stderr (MADS prints diagnostics to stdout) so the Output
// panel can show *where* it failed.

const manifest: ProjectManifestV2 = {
  version: MANIFEST_VERSION,
  name: 'demo',
  main: 'src/main.a65',
  toolchain: 'mads',
  machine: 'atari-xl',
}

const input = {
  projectId: 'p',
  files: [{ path: 'src/main.a65', content: new Uint8Array(), updatedAt: 0 }],
  manifest,
}

describe('BuildService events', () => {
  it('emits build:error with the assembler stdout + stderr on a failed assemble', async () => {
    const events = createEventBus()
    const errors: WorkbenchEvents['build:error'][] = []
    events.on('build:error', (p) => errors.push(p))

    const assemble: ToolchainAssembleFn = async () => ({
      ok: false,
      binary: undefined,
      stdout: 'main.a65 (12) ERROR: Undeclared label A (BANK=0)',
      stderr: '',
      exitCode: 1,
    })
    const svc = createBuildService({ events, toolchain: () => assemble, recipes: async () => [] })

    const r = await svc.build(input)
    expect(r.ok).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.stdout).toContain('ERROR: Undeclared label A')
    expect(errors[0]!.message).toMatch(/exit 1/)
  })

  it('emits build:done with the result on success', async () => {
    const events = createEventBus()
    const done: WorkbenchEvents['build:done'][] = []
    events.on('build:done', (p) => done.push(p))

    const assemble: ToolchainAssembleFn = async () => ({
      ok: true,
      binary: new Uint8Array([1, 2, 3]),
      stdout: 'Writing output... 3 bytes',
      stderr: '',
      exitCode: 0,
    })
    const svc = createBuildService({ events, toolchain: () => assemble, recipes: async () => [] })

    const r = await svc.build(input)
    expect(r.ok).toBe(true)
    expect(done).toHaveLength(1)
    expect(done[0]!.result.binary).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('treats a 0 exit with no binary as a failure (build:error)', async () => {
    const events = createEventBus()
    const errors: WorkbenchEvents['build:error'][] = []
    events.on('build:error', (p) => errors.push(p))

    // MADS sometimes exits 0 without emitting a binary — must still be a failure.
    const assemble: ToolchainAssembleFn = async () => ({
      ok: false,
      binary: undefined,
      stdout: 'parse error',
      stderr: '',
      exitCode: 0,
    })
    const svc = createBuildService({ events, toolchain: () => assemble, recipes: async () => [] })

    const r = await svc.build(input)
    expect(r.ok).toBe(false)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.stdout).toContain('parse error')
  })
})
