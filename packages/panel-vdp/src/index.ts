import type { PanelPlugin } from '@ports'
import { VdpPanel } from './VdpPanel'

export const vdpPanel: PanelPlugin = {
  kind: 'panel',
  id: 'vdp',
  title: 'VDP',
  // Shown for any machine that declares the Genesis VDP's 'vram' memory space
  // (Genesis today). The renderer decodes Genesis 4bpp tiles + the 9-bit CRAM
  // palette, served by the backend's readMem('vram'|'cram', …) (#146).
  supports: (machine) => !!machine.memorySpaces?.some((s) => s.id === 'vram'),
  Component: VdpPanel,
}
