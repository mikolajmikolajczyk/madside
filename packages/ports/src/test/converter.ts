// Contract harness for ConverterModule authors (ADR-0005). Static shape.
//
//   import { assertConverterPlugin } from '@ports/test'
//   it('contract', () => assertConverterPlugin(myConverter))

import { expect } from 'vitest'
import type { ConverterModule } from '../plugin-converter'

export function assertConverterPlugin(mod: ConverterModule): void {
  const m = mod.meta
  expect(m.id, 'meta.id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(m.label, 'meta.label must be non-empty').toBeTypeOf('string')
  expect(m.label.length).toBeGreaterThan(0)
  expect(Array.isArray(m.inputExt)).toBe(true)
  expect(m.inputExt.length, 'meta.inputExt lists at least one extension').toBeGreaterThan(0)
  for (const ext of m.inputExt) expect(ext, `inputExt '${ext}': lowercase, no dot`).toMatch(/^[a-z0-9]+$/)
  expect(Array.isArray(m.optionsSchema), 'meta.optionsSchema must be an array').toBe(true)
  expect(typeof mod.convert, 'convert must be a function').toBe('function')
}
