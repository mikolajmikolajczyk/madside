import type { MachinePlugin } from '@ports'
import { parseXexLoadRange } from './xex'

// Atari 800XL / 130XE — the first MachinePlugin. Constants here are the
// canonical truth; @adapters / @ui consumers migrate to read from this object
// over v0.4.0 follow-ups (display dims 7353947, sample rate c2dc46b,
// memoryMap 7f0c7f4, KBCODE 33eb166, hardware-config 40e0373, boot equates
// c4f26da, sendKey c5aaf5a).

export const atariXl: MachinePlugin = {
  kind: 'machine',
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
    // event.code → Win32-style virtual-key code that the Altirra wasm core's
    // PushKey path expects. Until the fork exposes a direct-KBCODE entry
    // point, the JS side becomes the canonical mapping authority and the C++
    // table is treated as a fallback.
    codeToKey: {
      // Letters
      KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45, KeyF: 0x46,
      KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4a, KeyK: 0x4b, KeyL: 0x4c,
      KeyM: 0x4d, KeyN: 0x4e, KeyO: 0x4f, KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52,
      KeyS: 0x53, KeyT: 0x54, KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58,
      KeyY: 0x59, KeyZ: 0x5a,
      // Digit row
      Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
      Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
      // Punctuation / symbols
      Minus: 0xbd, Equal: 0xbb, BracketLeft: 0xdb, BracketRight: 0xdd,
      Backslash: 0xdc, Semicolon: 0xba, Quote: 0xde, Comma: 0xbc, Period: 0xbe,
      Slash: 0xbf, Backquote: 0xc0,
      // Control / navigation
      Space: 0x20, Enter: 0x0d, Backspace: 0x08, Tab: 0x09, Escape: 0x1b,
      ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
      Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
      Insert: 0x2d, Delete: 0x2e,
      // Function keys — Atari uses F1-F4 for Start / Select / Option / Reset
      // console keys; PushKey side handles the dispatch.
      F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73,
      F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77,
      F9: 0x78, F10: 0x79, F11: 0x7a, F12: 0x7b,
    },
  },

  defaultPanels: ['memory', 'registers', 'output', 'asset'],
  compatibleToolchains: ['mads'],
  compatibleEmulators: ['altirra-wasm'],
  compatibleDebugAdapters: ['atari-6502-debug'],

  media: {
    formats: ['xex', 'atr', 'car', 'cas'],
    extToFormat: {
      xex: 'xex', exe: 'xex', com: 'xex', obx: 'xex',
      atr: 'atr',
      car: 'car', rom: 'car', bin: 'car',
      cas: 'cas',
    },
    defaultFormat: 'xex',
    detect(bytes) {
      if (bytes.length >= 2 && bytes[0] === 0x96 && bytes[1] === 0x02) return 'atr'
      if (bytes.length >= 4) {
        const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
        if (tag === 'CART') return 'car'
        if (tag === 'FUJI') return 'cas'
        if (bytes[0] === 0xff && bytes[1] === 0xff) return 'xex'
      }
      return undefined
    },
  },

  // Boot allowance for the check-runner (#30): the program's load range, parsed
  // from the XEX, lets the runner advance past the Atari OS cold-boot before
  // counting `afterFrames`.
  programLoadRange: parseXexLoadRange,

  // Numeric values track ATHardwareMode / ATMemoryMode in
  // Altirra/h/constants.h. 800XL = 1, 64K = 2. kernel left undefined so the
  // wasm boot path's hardcoded LLEXL pick stands; project manifest can
  // override later.
  hardwareConfig: {
    hardwareMode: 1, // kATHardwareMode_800XL
    memoryMode: 2,   // kATMemoryMode_64K
    basic: false,
  },

  // Common Atari OS equates, injected into new projects from here (the machine
  // plugin is the single source).
  bootEquates: {
    path: 'src/atari.a65',
    content: `; common Atari OS equates
SAVMSC = $58
COLOR0 = $2C4
COLOR1 = $2C5
COLOR2 = $2C6
EOL    = $9B
`,
  },
}
