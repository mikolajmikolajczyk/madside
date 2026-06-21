import { beforeEach, describe, expect, it } from 'vitest'
import { clearRecipeCache, listBuiltins, runRecipes } from '@madside/converters'
import type { Recipe } from '@ports'

// Converter byte-output + recipe-engine tests (ADR-0005 Layer-1/2).
// asset-pipeline-affected.test.ts mocks the runner, so the real converters and
// the fingerprint cache never execute there — these cover the actual bytes out
// and one real converter driven through the real engine.

const enc = new TextEncoder()
const dec = new TextDecoder()
const byId = (id: string) => {
  const c = listBuiltins().find((b) => b.meta.id === id)
  if (!c) throw new Error(`missing built-in converter: ${id}`)
  return c
}

describe('bin-to-incbin converter', () => {
  it('emits one $hex dta line per perLine bytes', async () => {
    const out = await byId('bin-to-incbin').convert(new Uint8Array([0x00, 0xab, 0xff]), { perLine: 16 })
    expect(dec.decode(out.bytes)).toBe(
      [
        '; generated from converter "bin-to-incbin"',
        '; 3 bytes',
        'data',
        '        dta $00,$AB,$FF',
        '',
      ].join('\n'),
    )
    expect(out.summary).toBe('3 bytes → 4 lines')
  })

  it('wraps at perLine and honours the label option', async () => {
    const out = await byId('bin-to-incbin').convert(new Uint8Array([1, 2, 3, 4]), { label: 'tab', perLine: 2 })
    expect(dec.decode(out.bytes)).toBe(
      [
        '; generated from converter "bin-to-incbin"',
        '; 4 bytes',
        'tab',
        '        dta $01,$02',
        '        dta $03,$04',
        '',
      ].join('\n'),
    )
  })
})

describe('csv-to-data converter', () => {
  it('passes through MADS literals and formats decimals', async () => {
    const input = enc.encode('1, 2 , 3\n$ff, %101\n\n')
    const out = await byId('csv-to-data').convert(input, { label: 'tab', size: 'byte' })
    expect(dec.decode(out.bytes)).toBe(
      [
        '; generated from converter "csv-to-data" (byte)',
        'tab',
        '        dta 1,2,3',
        '        dta $ff,%101',
        '',
      ].join('\n'),
    )
    expect(out.summary).toBe('5 cells, byte')
  })

  it('strips inline # comment cells and skips blank rows', async () => {
    const out = await byId('csv-to-data').convert(enc.encode('1,2,# tail\n# whole\n3\n'), {})
    expect(dec.decode(out.bytes)).toBe(
      [
        '; generated from converter "csv-to-data" (byte)',
        'data',
        '        dta 1,2',
        '        dta 3',
        '',
      ].join('\n'),
    )
    expect(out.summary).toBe('3 cells, byte')
  })

  it('emits `dta a` for word size', async () => {
    const out = await byId('csv-to-data').convert(enc.encode('256,512'), { size: 'word' })
    expect(dec.decode(out.bytes)).toContain('        dta a 256,512')
  })
})

describe('runRecipes (real converter through the engine)', () => {
  const projectId = 'p-conv'
  beforeEach(() => clearRecipeCache(projectId))

  const recipe: Recipe = { input: 'data.csv', output: 'gen/data.asm', converter: 'csv-to-data', options: { label: 'tab' } }
  const files = (csv: string) => [{ path: 'data.csv', content: enc.encode(csv) }]

  it('runs the converter and writes the output bytes', async () => {
    const written = new Map<string, Uint8Array>()
    const res = await runRecipes(projectId, [recipe], files('1,2,3'), async (p, b) => { written.set(p, b) })
    expect(res[0]!.ok).toBe(true)
    expect(res[0]!.skipped).toBeUndefined()
    expect(dec.decode(written.get('gen/data.asm')!)).toContain('        dta 1,2,3')
  })

  it('skips on an unchanged fingerprint, re-runs when the input changes', async () => {
    const sink = async () => {}
    const seed = [...files('1,2,3'), { path: 'gen/data.asm', content: enc.encode('stale') }]
    await runRecipes(projectId, [recipe], seed, sink)
    // second call, identical input + output present → cache hit
    const again = await runRecipes(projectId, [recipe], seed, sink)
    expect(again[0]!.skipped).toBe(true)
    // input changes → fingerprint differs → re-runs
    const changed = await runRecipes(projectId, [recipe], [...files('9,9'), seed[1]!], sink)
    expect(changed[0]!.skipped).toBeUndefined()
    expect(changed[0]!.ok).toBe(true)
  })

  it('reports a missing input and an unregistered converter', async () => {
    const sink = async () => {}
    const r1 = await runRecipes(projectId, [{ ...recipe, input: 'ghost.csv' }], files('1'), sink)
    expect(r1[0]!.ok).toBe(false)
    expect(r1[0]!.error).toMatch(/input not found/)
    const r2 = await runRecipes(projectId, [{ ...recipe, converter: 'nope' }], files('1'), sink)
    expect(r2[0]!.error).toMatch(/converter not registered/)
  })
})
