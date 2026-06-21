import type { PanelPlugin } from '@ports'
import { MemoryPanel } from './MemoryPanel'

export const memoryPanel: PanelPlugin = {
  kind: 'panel',
  id: 'memory',
  title: 'Memory',
  Component: MemoryPanel,
}
