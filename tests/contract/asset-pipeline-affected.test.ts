import { beforeEach, describe, expect, it } from 'vitest'
import {
  createAssetPipelineService,
  createEventBus,
  type RecipeRunnerResultLike,
} from '@madside/workbench-core'
import type { AssetPipelineInput, Recipe } from '@ports'

describe('AssetPipelineService.runAffected', () => {
  // Fake recipe runner with a fingerprint cache mimicking the real engine.
  // Two recipes: one whose input changes between calls, one stable.
  const cache = new Map<string, string>()

  beforeEach(() => {
    cache.clear()
  })

  const makeRunner = () =>
    async (
      _projectId: string,
      recipes: Recipe[],
      files: { path: string; content: Uint8Array }[],
    ): Promise<RecipeRunnerResultLike[]> => {
      const byPath = new Map(files.map((f) => [f.path, f.content]))
      return recipes.map((r) => {
        const bytes = byPath.get(r.input) ?? new Uint8Array()
        const fp = bytes.length + ':' + Array.from(bytes).join(',')
        const last = cache.get(r.output)
        if (last === fp) {
          // Skipped — pass through with no output bytes and no error.
          return { ok: true, recipe: r }
        }
        cache.set(r.output, fp)
        return {
          ok: true,
          recipe: r,
          output: { path: r.output, content: new Uint8Array([99]) },
        }
      })
    }

  const recipes: Recipe[] = [
    { input: 'a.bin', output: 'a.out', converter: 'pass' },
    { input: 'b.bin', output: 'b.out', converter: 'pass' },
  ]
  const baseInput: AssetPipelineInput = {
    projectId: 'p1',
    recipes,
    files: [
      { path: 'a.bin', content: new Uint8Array([1, 2, 3]) },
      { path: 'b.bin', content: new Uint8Array([4, 5, 6]) },
    ],
  }

  it('runAffected returns every recipe on the first call', async () => {
    const svc = createAssetPipelineService({
      events: createEventBus(),
      recipes: makeRunner(),
    })
    const r = await svc.runAffected(baseInput)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(2)
  })

  it('runAffected returns only changed recipes on the second call', async () => {
    const svc = createAssetPipelineService({
      events: createEventBus(),
      recipes: makeRunner(),
    })
    await svc.runAffected(baseInput)
    // Tweak a.bin only.
    const tweaked: AssetPipelineInput = {
      ...baseInput,
      files: [
        { path: 'a.bin', content: new Uint8Array([1, 2, 9]) },
        { path: 'b.bin', content: new Uint8Array([4, 5, 6]) },
      ],
    }
    const r = await svc.runAffected(tweaked)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toHaveLength(1)
      expect(r.value[0]!.output).toBe('a.out')
    }
  })

  it('runAffected returns nothing when no inputs changed', async () => {
    const svc = createAssetPipelineService({
      events: createEventBus(),
      recipes: makeRunner(),
    })
    await svc.runAffected(baseInput)
    const r = await svc.runAffected(baseInput)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([])
  })
})
