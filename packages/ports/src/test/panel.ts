// Contract harness for PanelPlugin authors (ADR-0005). Static shape — a panel
// is either a React Component or a vanilla mount(), exactly one.
//
//   import { assertPanelPlugin } from '@ports/test'
//   it('contract', () => assertPanelPlugin(myPanel))

import { expect } from 'vitest'
import type { PanelPlugin } from '../plugin-panel'

export function assertPanelPlugin(panel: PanelPlugin): void {
  expect(panel.id, 'id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(panel.title, 'title must be non-empty').toBeTypeOf('string')
  expect(panel.title.length).toBeGreaterThan(0)

  // Exactly one render path.
  const hasComponent = 'Component' in panel && panel.Component != null
  const hasMount = 'mount' in panel && panel.mount != null
  expect(hasComponent !== hasMount, 'set exactly one of Component / mount').toBe(true)
  if (hasComponent) expect(typeof panel.Component).toBe('function')
  if (hasMount) expect(typeof panel.mount).toBe('function')

  if (panel.supports !== undefined) {
    expect(typeof panel.supports, 'supports must be a function when present').toBe('function')
  }
  if (panel.fileExt !== undefined) {
    expect(Array.isArray(panel.fileExt)).toBe(true)
    for (const ext of panel.fileExt) {
      expect(ext, `fileExt '${ext}': lowercase, no dot`).toMatch(/^[a-z0-9]+$/)
    }
  }
}
