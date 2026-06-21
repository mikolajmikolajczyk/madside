import type { PanelPlugin } from '@ports'
import { OutputPanel } from './OutputPanel'

export const outputPanel: PanelPlugin = {
  kind: 'panel',
  id: 'output',
  title: 'Output',
  slot: 'output',
  Component: OutputPanel,
}
