import type { MachinePlugin } from '@ports'

// Nintendo Entertainment System (NTSC) — the second MachinePlugin, validating
// the machine abstraction (ADR-0001 M9: second machine, zero workbench
// changes). Pairs with the jsnes emulator backend (@plugins/emulator-nes-jsnes,
// issue b41098c) and the MADS toolchain — MADS assembles NROM iNES directly
// (proven b41098c), so no NES-specific toolchain is required for validation.

export const machineNes: MachinePlugin = {
  id: 'nes',
  name: 'Nintendo Entertainment System (NTSC)',
  cpu: 'ricoh-2a03',

  display: {
    width: 256,
    height: 240,
    fps: 60,
    // jsnes emits 0x00RRGGBB; JsnesBackend.blit() pre-swaps to canvas-native
    // RGBA, so the Emulator renderer takes its memcpy fast path.
    pixelFormat: 'rgba8888',
  },

  audio: {
    sampleRate: 44100,
    channels: 1,
  },

  // CPU-visible address space. RAM + PPU register windows repeat via mirrors;
  // the viewer surfaces the mirror ranges so a write to $0800 reads back at
  // $0000. PRG-ROM ($8000-$ffff) is where NROM maps the 16/32 KB image.
  memoryMap: [
    { start: 0x0000, end: 0x07ff, name: 'RAM', kind: 'ram', writable: true },
    { start: 0x0800, end: 0x1fff, name: 'RAM mirrors', kind: 'mirror', writable: true },
    { start: 0x2000, end: 0x2007, name: 'PPU registers', kind: 'io', writable: true, chip: 'ppu' },
    { start: 0x2008, end: 0x3fff, name: 'PPU register mirrors', kind: 'mirror', writable: true, chip: 'ppu' },
    { start: 0x4000, end: 0x4013, name: 'APU', kind: 'io', writable: true, chip: 'apu' },
    { start: 0x4014, end: 0x4014, name: 'OAM DMA', kind: 'io', writable: true, chip: 'ppu' },
    { start: 0x4015, end: 0x4015, name: 'APU status', kind: 'io', writable: true, chip: 'apu' },
    { start: 0x4016, end: 0x4017, name: 'Controllers / APU frame', kind: 'io', writable: true },
    { start: 0x4018, end: 0x401f, name: 'APU test (disabled)', kind: 'unmapped', writable: false },
    { start: 0x4020, end: 0x5fff, name: 'Expansion / mapper', kind: 'io', writable: true },
    { start: 0x6000, end: 0x7fff, name: 'PRG-RAM (WRAM)', kind: 'ram', writable: true },
    { start: 0x8000, end: 0xffff, name: 'PRG-ROM', kind: 'rom', writable: false },
  ],

  // Extra address spaces beyond the CPU bus, read via readMemory(.., space).
  // The PPU has its own 16 KB space (pattern tables / nametables / palette);
  // OAM is the 256-byte sprite table. The PPU viewer panel reads these.
  memorySpaces: [
    { id: 'ppu', label: 'PPU VRAM', size: 0x4000 },
    { id: 'oam', label: 'OAM', size: 0x100 },
  ],

  devices: [
    { id: 'ppu', name: 'PPU (2C02)', ioRange: { start: 0x2000, end: 0x2007 } },
    { id: 'apu', name: 'APU (2A03)', ioRange: { start: 0x4000, end: 0x4017 } },
  ],

  input: {
    kind: 'controller',
    buttons: ['A', 'B', 'Select', 'Start', 'Up', 'Down', 'Left', 'Right'],
    // KeyboardEvent.code → jsnes Controller.BUTTON_* index (0..7). The jsnes
    // backend's sendKey decodes the index to buttonDown/buttonUp on pad 1.
    codeToKey: {
      KeyX: 0,        // A
      KeyZ: 1,        // B
      ShiftRight: 2,  // Select
      Enter: 3,       // Start
      ArrowUp: 4,
      ArrowDown: 5,
      ArrowLeft: 6,
      ArrowRight: 7,
    },
  },

  defaultPanels: ['memory', 'registers', 'ppu', 'output'],
  compatibleToolchains: ['mads'],
  compatibleEmulators: ['jsnes'],
  // NES is a 6502; the Atari 6502 adapter is CPU-shape-generic and serves it
  // verbatim until a labelled debug-nes adapter lands.
  compatibleDebugAdapters: ['atari-6502-debug'],

  media: {
    formats: ['nes'],
    extToFormat: { nes: 'nes' },
    defaultFormat: 'nes',
    // iNES header magic: "NES" + $1a.
    detect(bytes) {
      if (
        bytes.length >= 4 &&
        bytes[0] === 0x4e &&
        bytes[1] === 0x45 &&
        bytes[2] === 0x53 &&
        bytes[3] === 0x1a
      ) {
        return 'nes'
      }
      return undefined
    },
  },

  // Common NES register equates the seed-project flow injects. Mirrors the
  // Atari src/atari.a65 convention; MADS sources `icl 'src/nes.a65'`.
  bootEquates: {
    path: 'src/nes.a65',
    content: `; common NES register equates
PPUCTRL   = $2000
PPUMASK   = $2001
PPUSTATUS = $2002
OAMADDR   = $2003
OAMDATA   = $2004
PPUSCROLL = $2005
PPUADDR   = $2006
PPUDATA   = $2007
OAMDMA    = $4014
APUSTATUS = $4015
JOY1      = $4016
JOY2      = $4017
`,
  },
}
