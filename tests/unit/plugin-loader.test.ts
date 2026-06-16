import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginLoader } from '@adapters/plugin-loader'

// plugin-loader is the project-local-plugin execution path (ADR-0005 Layer-1):
// new Blob([src]) → URL.createObjectURL → dynamic import(url) → validate, with a
// content-hash cache that revokes + re-imports on change. Node can't import a
// blob: URL, so we swap Blob + URL for stubs that hand back a data: URL carrying
// the same source — which Node *can* import — exercising the real logic.

const realBlob = globalThis.Blob

class FakeBlob {
  parts: string[]
  constructor(parts: string[]) { this.parts = parts }
}

let createSpy: ReturnType<typeof vi.fn>
let revokeSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // @ts-expect-error part-capturing stand-in for the DOM Blob
  globalThis.Blob = FakeBlob
  createSpy = vi.fn((b: FakeBlob) =>
    'data:text/javascript;base64,' + Buffer.from(b.parts.join('')).toString('base64'))
  revokeSpy = vi.fn()
  globalThis.URL.createObjectURL = createSpy as never
  globalThis.URL.revokeObjectURL = revokeSpy as never
})

afterEach(() => {
  globalThis.Blob = realBlob
})

const idLoader = () => createPluginLoader<string>((m) => (m as { id: string }).id)
const srcA = { path: 'p.js', content: 'export const id = "a"' }

describe('createPluginLoader', () => {
  it('imports the module, validates it, and creates exactly one Blob URL', async () => {
    const loader = idLoader()
    expect(await loader.load(srcA)).toBe('a')
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('returns the cached module on identical content without re-importing', async () => {
    const loader = idLoader()
    await loader.load(srcA)
    await loader.load({ ...srcA }) // same path + same content
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('revokes the stale URL and re-imports when the content changes', async () => {
    const loader = idLoader()
    await loader.load(srcA)
    expect(await loader.load({ path: 'p.js', content: 'export const id = "b"' })).toBe('b')
    expect(createSpy).toHaveBeenCalledTimes(2)
    expect(revokeSpy).toHaveBeenCalledTimes(1)
  })

  it('revokes the URL and propagates when validation throws', async () => {
    const loader = createPluginLoader<string>(() => { throw new Error('bad shape') })
    await expect(loader.load(srcA)).rejects.toThrow('bad shape')
    expect(revokeSpy).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed load — a later valid load still imports', async () => {
    let bomb = true
    const loader = createPluginLoader<string>((m) => {
      if (bomb) throw new Error('bad shape')
      return (m as { id: string }).id
    })
    await expect(loader.load(srcA)).rejects.toThrow('bad shape')
    bomb = false
    expect(await loader.load(srcA)).toBe('a')
    expect(createSpy).toHaveBeenCalledTimes(2)
  })
})
