import type { PanelPlugin } from '@ports'
import { OutputPanel } from './OutputPanel'

export const outputPanel: PanelPlugin = {
  id: 'output',
  title: 'Output',
  Component: OutputPanel,
}
