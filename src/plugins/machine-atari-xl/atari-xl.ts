import type { MachinePlugin } from '@ports'

// Atari 800XL / 130XE — the first MachinePlugin. Constants here are the
// canonical truth; @adapters / @ui consumers migrate to read from this object
// over v0.4.0 follow-ups (display dims 7353947, sample rate c2dc46b,
// memoryMap 7f0c7f4, KBCODE 33eb166, hardware-config 40e0373, boot equates
// c4f26da, sendKey c5aaf5a).

export const atariXl: MachinePlugin = {
  id: 'atari-xl',
  name: 'Atari 800XL / 130XE',
  cpu: 'mos6502',

  display: {
    width: 336,
    height: 224,
    fps: 60,
    pixelFormat: 'xrgb8888',
  },

  audio: {
    sampleRate: 63920,
    channels: 1,
  },

  // Coarse first pass — Altirra exposes finer detail through DRAM3 / hardware
  // banks. Issue 7f0c7f4 carves these into chip-tagged sub-regions.
  memoryMap: [
    { start: 0x0000, end: 0x00ff, name: 'Zero page', kind: 'ram', writable: true },
    { start: 0x0100, end: 0x01ff, name: 'Stack', kind: 'ram', writable: true },
    { start: 0x0200, end: 0x07ff, name: 'OS RAM', kind: 'ram', writable: true },
    { start: 0x0800, end: 0x9fff, name: 'Free RAM', kind: 'ram', writable: true },
    { start: 0xa000, end: 0xbfff, name: 'BASIC ROM / extra RAM', kind: 'rom', writable: false },
    { start: 0xc000, end: 0xcfff, name: 'XL/XE self-test', kind: 'rom', writable: false },
    { start: 0xd000, end: 0xd0ff, name: 'GTIA', kind: 'io', writable: true, chip: 'gtia' },
    { start: 0xd200, end: 0xd2ff, name: 'POKEY', kind: 'io', writable: true, chip: 'pokey' },
    { start: 0xd300, end: 0xd3ff, name: 'PIA', kind: 'io', writable: true, chip: 'pia' },
    { start: 0xd400, end: 0xd4ff, name: 'ANTIC', kind: 'io', writable: true, chip: 'antic' },
    { start: 0xd800, end: 0xffff, name: 'Kernel ROM', kind: 'rom', writable: false },
  ],

  devices: [
    { id: 'antic', name: 'ANTIC', ioRange: { start: 0xd400, end: 0xd4ff } },
    { id: 'gtia',  name: 'GTIA',  ioRange: { start: 0xd000, end: 0xd0ff } },
    { id: 'pokey', name: 'POKEY', ioRange: { start: 0xd200, end: 0xd2ff } },
    { id: 'pia',   name: 'PIA',   ioRange: { start: 0xd300, end: 0xd3ff } },
  ],

  input: {
    kind: 'keyboard',
    // codeToKey populated by 33eb166 — KBCODE table lift moves the Atari
    // keyboard map from Emulator.tsx into this slot.
  },

  defaultPanels: ['memory', 'registers', 'output', 'asset'],
  compatibleToolchains: ['mads'],
  compatibleEmulators: ['altirra-wasm'],

  // bootEquates populated by c4f26da — atari.a65 ships from this plugin once
  // the seed project flow learns to inject from MachinePlugin.bootEquates.
}
