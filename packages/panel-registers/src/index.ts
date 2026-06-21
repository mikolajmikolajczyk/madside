import type { PanelPlugin } from '@ports'
import { RegistersPanel } from './RegistersPanel'

export const registersPanel: PanelPlugin = {
  kind: 'panel',
  id: 'registers',
  title: 'Registers',
  Component: RegistersPanel,
}
