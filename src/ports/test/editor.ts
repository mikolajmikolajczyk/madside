// Contract harness for EditorModule authors (ADR-0005). Static shape.
//
//   import { assertEditorPlugin } from '@ports/test'
//   it('contract', () => assertEditorPlugin(myEditor))

import { expect } from 'vitest'
import type { EditorModule } from '../plugin-editor'

export function assertEditorPlugin(mod: EditorModule): void {
  const m = mod.meta
  expect(m.id, 'meta.id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(m.label, 'meta.label must be non-empty').toBeTypeOf('string')
  expect(m.label.length).toBeGreaterThan(0)
  expect(Array.isArray(m.fileExt)).toBe(true)
  expect(m.fileExt.length, 'meta.fileExt lists at least one extension').toBeGreaterThan(0)
  for (const ext of m.fileExt) expect(ext, `fileExt '${ext}': lowercase, no dot`).toMatch(/^[a-z0-9]+$/)
  expect(typeof mod.mount, 'mount must be a function').toBe('function')
}
