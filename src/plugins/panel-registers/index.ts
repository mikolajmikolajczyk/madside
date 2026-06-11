import type { PanelPlugin } from '@ports'
import { RegistersPanel } from './RegistersPanel'

export const registersPanel: PanelPlugin = {
  id: 'registers',
  title: 'Registers',
  Component: RegistersPanel,
}
