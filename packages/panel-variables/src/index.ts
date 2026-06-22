import type { PanelPlugin } from '@ports'
import { VariablesPanel } from './VariablesPanel'

export const variablesPanel: PanelPlugin = {
  kind: 'panel',
  id: 'variables',
  title: 'Variables',
  slot: 'debug',
  Component: VariablesPanel,
}
