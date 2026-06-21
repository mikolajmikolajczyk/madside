import { describe, expect, it } from 'vitest'
import { coerceCc65Options } from './ca65-toolchain'

describe('coerceCc65Options (#51)', () => {
  it('returns empty options when none given', () => {
    expect(coerceCc65Options(undefined)).toEqual({ ok: true, value: {} })
    expect(coerceCc65Options({})).toEqual({ ok: true, value: {} })
  })

  it('accepts config + per-tool arg arrays', () => {
    const r = coerceCc65Options({
      config: 'src/custom.cfg',
      cc65Args: ['-Osir'],
      ca65Args: ['-D', 'X'],
      ld65Args: ['-D', '__FOO__=1'],
    })
    expect(r).toEqual({
      ok: true,
      value: { config: 'src/custom.cfg', cc65Args: ['-Osir'], ca65Args: ['-D', 'X'], ld65Args: ['-D', '__FOO__=1'] },
    })
  })

  it('ignores unrelated keys (e.g. another toolchain’s)', () => {
    const r = coerceCc65Options({ args: ['-i:.'], config: 'a.cfg' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ config: 'a.cfg' }) // `args` is MADS', not cc65's
  })

  it('rejects a non-string config', () => {
    const r = coerceCc65Options({ config: 42 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/config/)
  })

  it('rejects per-tool args that are not string arrays', () => {
    for (const key of ['cc65Args', 'ca65Args', 'ld65Args']) {
      const r = coerceCc65Options({ [key]: ['ok', 7] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(new RegExp(key))
    }
  })
})
