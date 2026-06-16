import type { PanelPlugin } from '@ports'
import { PpuPanel } from './PpuPanel'

export const ppuPanel: PanelPlugin = {
  kind: 'panel',
  id: 'ppu',
  title: 'PPU',
  // Universal gate: shown for any machine that declares a 'ppu' memory space
  // (NES today). The renderer decodes NES 2bpp tiles + the 2C02 palette, so a
  // future machine with different PPU semantics would ship its own panel.
  supports: (machine) => !!machine.memorySpaces?.some((s) => s.id === 'ppu'),
  Component: PpuPanel,
}
