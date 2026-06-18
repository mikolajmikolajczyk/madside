import { describe, expect, it } from 'vitest'
import { MANIFEST_VERSION, parseProjectManifest } from '@ports'

const minimal = {
  version: MANIFEST_VERSION,
  name: 'demo',
  main: 'src/main.a65',
  machine: 'atari-xl',
  toolchain: 'mads',
}

describe('parseProjectManifest — v2 schema validator', () => {
  it('accepts a minimal valid v2 manifest', () => {
    const r = parseProjectManifest(minimal)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.version).toBe(2)
      expect(r.value.machine).toBe('atari-xl')
      expect(r.value.toolchain).toBe('mads')
    }
  })

  it('rejects v1 with an actionable error', () => {
    const r = parseProjectManifest({ ...minimal, version: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('manifest')
      expect(r.error.message).toBe('project.json v1 unsupported, recreate project')
    }
  })

  it('rejects unknown versions', () => {
    const r = parseProjectManifest({ ...minimal, version: 99 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/version 99 unsupported/)
  })

  it('rejects non-object input', () => {
    expect(parseProjectManifest(null).ok).toBe(false)
    expect(parseProjectManifest('hello').ok).toBe(false)
    expect(parseProjectManifest([]).ok).toBe(false)
  })

  it.each(['name', 'main', 'machine', 'toolchain'])('rejects missing %s', (key) => {
    const raw: Record<string, unknown> = { ...minimal }
    delete raw[key]
    const r = parseProjectManifest(raw)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(new RegExp(key))
  })

  it('preserves optional emulator + debugAdapter + panels', () => {
    const r = parseProjectManifest({
      ...minimal,
      emulator: 'altirra-wasm',
      debugAdapter: 'atari-6502-debug',
      panels: ['memory', 'registers'],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.emulator).toBe('altirra-wasm')
      expect(r.value.debugAdapter).toBe('atari-6502-debug')
      expect(r.value.panels).toEqual(['memory', 'registers'])
    }
  })

  it('drops malformed panels (not an array of strings)', () => {
    const r = parseProjectManifest({ ...minimal, panels: ['ok', 42] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.panels).toBeUndefined()
  })

  it('folds a legacy top-level build.args into options.args', () => {
    const r = parseProjectManifest({ ...minimal, build: { args: ['-d:DEBUG=1', '-i:lib'] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.build).toEqual({ options: { args: ['-d:DEBUG=1', '-i:lib'] } })
  })

  it('passes build.options through verbatim (toolchain-specific bag)', () => {
    const opts = { config: 'src/custom.cfg', ld65Args: ['-D', '__FOO__=1'] }
    const r = parseProjectManifest({ ...minimal, build: { options: opts } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.build).toEqual({ options: opts })
  })

  it('explicit options.args wins over the legacy build.args alias', () => {
    const r = parseProjectManifest({ ...minimal, build: { args: ['legacy'], options: { args: ['new'] } } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.build?.options).toEqual({ args: ['new'] })
  })

  it('accepts an empty build object', () => {
    const r = parseProjectManifest({ ...minimal, build: {} })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.build).toEqual({})
  })

  it('rejects build.args that are not all strings', () => {
    const r = parseProjectManifest({ ...minimal, build: { args: ['-d:X', 42] } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/build\.args/)
  })

  it('rejects build.options that is not an object', () => {
    const r = parseProjectManifest({ ...minimal, build: { options: ['x'] } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/build\.options/)
  })

  it("accepts build.trigger 'auto' | 'manual'", () => {
    for (const trigger of ['auto', 'manual'] as const) {
      const r = parseProjectManifest({ ...minimal, build: { trigger } })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.build).toEqual({ trigger })
    }
  })

  it('rejects an unknown build.trigger', () => {
    const r = parseProjectManifest({ ...minimal, build: { trigger: 'onSave' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/build\.trigger/)
  })

  it('accepts editor.tabWidth as an integer 1–16', () => {
    const r = parseProjectManifest({ ...minimal, editor: { tabWidth: 2 } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.editor).toEqual({ tabWidth: 2 })
  })

  it('rejects a non-integer / out-of-range editor.tabWidth', () => {
    for (const tabWidth of [0, 17, 3.5, '4']) {
      const r = parseProjectManifest({ ...minimal, editor: { tabWidth } })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.message).toMatch(/tabWidth/)
    }
  })

  it('accepts editor.format (clang-format preset/style) alongside tabWidth', () => {
    const r = parseProjectManifest({ ...minimal, editor: { tabWidth: 2, format: 'Google' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.editor).toEqual({ tabWidth: 2, format: 'Google' })
  })

  it('rejects a non-string / empty editor.format', () => {
    for (const format of [42, '']) {
      const r = parseProjectManifest({ ...minimal, editor: { format } })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.message).toMatch(/editor\.format/)
    }
  })
})
