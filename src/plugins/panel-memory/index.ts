import type { PanelPlugin } from '@ports'
import { MemoryPanel } from './MemoryPanel'

export const memoryPanel: PanelPlugin = {
  id: 'memory',
  title: 'Memory',
  Component: MemoryPanel,
}
