import { describe, expect, it } from 'vitest'
import { createBuildService, createEventBus, type ToolchainAssembleFn } from '@services'
import { MANIFEST_VERSION, type ProjectManifestV2 } from '@ports'

// Manifest build options reach the toolchain (issue 04bdb5a). BuildService
// forwards manifest.build to the assemble fn's options arg.

function manifest(build?: ProjectManifestV2['build']): ProjectManifestV2 {
  return {
    version: MANIFEST_VERSION,
    name: 'demo',
    main: 'src/main.a65',
    machine: 'atari-xl',
    toolchain: 'mads',
    ...(build ? { build } : {}),
  }
}

describe('manifest build options → toolchain', () => {
  it('passes manifest.build to the assemble fn as options', async () => {
    let captured: Record<string, unknown> | undefined
    const assemble: ToolchainAssembleFn = async (_main, _files, options) => {
      captured = options
      return { ok: true, binary: new Uint8Array([1]), stdout: '', stderr: '', exitCode: 0 }
    }
    const svc = createBuildService({
      events: createEventBus(),
      toolchain: () => assemble,
      recipes: async () => [],
    })

    await svc.build({
      projectId: 'p',
      files: [{ path: 'src/main.a65', content: new Uint8Array(), updatedAt: 0 }],
      manifest: manifest({ args: ['-d:DEBUG=1'] }),
    })
    expect(captured).toEqual({ args: ['-d:DEBUG=1'] })
  })

  it('passes undefined options when the manifest has no build block', async () => {
    let captured: Record<string, unknown> | undefined = { sentinel: true }
    const assemble: ToolchainAssembleFn = async (_main, _files, options) => {
      captured = options
      return { ok: true, binary: new Uint8Array([1]), stdout: '', stderr: '', exitCode: 0 }
    }
    const svc = createBuildService({
      events: createEventBus(),
      toolchain: () => assemble,
      recipes: async () => [],
    })

    await svc.build({
      projectId: 'p',
      files: [{ path: 'src/main.a65', content: new Uint8Array(), updatedAt: 0 }],
      manifest: manifest(),
    })
    expect(captured).toBeUndefined()
  })
})
