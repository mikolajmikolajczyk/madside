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
})
