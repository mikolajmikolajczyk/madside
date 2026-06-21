import type { MachinePlugin } from '@ports'

// Commodore 64 (PAL) — the third MachinePlugin (issue #53). Same shape as
// machine-atari-xl / machine-nes; validates the machine abstraction against a
// home computer with a full KERNAL/BASIC ROM set. Pairs with the chips
// `systems/c64.h` emulator core (@plugins/emulator-c64-chips) and the cc65
// toolchain (`-t c64`, .prg output). The Commodore ROMs are Cloanto-copyright
// and are NOT shipped — the emulator boots on the MEGA65 Open ROMs (GPL-3),
// supplied to the chips core at init.

export const machineC64: MachinePlugin = {
  kind: 'machine',
  id: 'c64',
  name: 'Commodore 64 (PAL)',
  cpu: 'mos6510',

  display: {
    // chips c64.h emits a 392×272 RGBA8 framebuffer (full PAL visible area incl.
    // border). The RunBackend is the source of truth for the live dimensions;
    // these mirror it for panels that read the machine metadata.
    width: 392,
    height: 272,
    fps: 50,
    pixelFormat: 'rgba8888',
  },

  audio: {
    // SID output; chips renders at the audio-context rate. Pinned through the
    // backend like jsnes' APU.
    sampleRate: 44100,
    channels: 1,
  },

  // Default power-on banking (LORAM/HIRAM/CHAREN = 1): BASIC ROM in at
  // $A000-$BFFF, I/O block at $D000-$DFFF, KERNAL at $E000-$FFFF. The chips
  // core honours the banking bits via the 6510 port ($0000/$0001); the viewer
  // shows the cold-boot layout.
  memoryMap: [
    { start: 0x0000, end: 0x0001, name: '6510 I/O port', kind: 'io', writable: true },
    { start: 0x0002, end: 0x00ff, name: 'Zero page', kind: 'ram', writable: true },
    { start: 0x0100, end: 0x01ff, name: 'Stack', kind: 'ram', writable: true },
    { start: 0x0200, end: 0x03ff, name: 'OS RAM / vectors', kind: 'ram', writable: true },
    { start: 0x0400, end: 0x07ff, name: 'Screen RAM', kind: 'ram', writable: true },
    { start: 0x0800, end: 0x9fff, name: 'BASIC / free RAM', kind: 'ram', writable: true },
    { start: 0xa000, end: 0xbfff, name: 'BASIC ROM', kind: 'rom', writable: false },
    { start: 0xc000, end: 0xcfff, name: 'RAM', kind: 'ram', writable: true },
    { start: 0xd000, end: 0xd3ff, name: 'VIC-II', kind: 'io', writable: true, chip: 'vic' },
    { start: 0xd400, end: 0xd7ff, name: 'SID', kind: 'io', writable: true, chip: 'sid' },
    { start: 0xd800, end: 0xdbff, name: 'Color RAM', kind: 'ram', writable: true },
    { start: 0xdc00, end: 0xdcff, name: 'CIA 1', kind: 'io', writable: true, chip: 'cia1' },
    { start: 0xdd00, end: 0xddff, name: 'CIA 2', kind: 'io', writable: true, chip: 'cia2' },
    { start: 0xde00, end: 0xdfff, name: 'I/O 1 / I/O 2 (expansion)', kind: 'io', writable: true },
    { start: 0xe000, end: 0xffff, name: 'KERNAL ROM', kind: 'rom', writable: false },
  ],

  devices: [
    { id: 'vic',  name: 'VIC-II (6569)', ioRange: { start: 0xd000, end: 0xd3ff } },
    { id: 'sid',  name: 'SID (6581)',    ioRange: { start: 0xd400, end: 0xd7ff } },
    { id: 'cia1', name: 'CIA 1 (6526)',  ioRange: { start: 0xdc00, end: 0xdcff } },
    { id: 'cia2', name: 'CIA 2 (6526)',  ioRange: { start: 0xdd00, end: 0xddff } },
  ],

  input: {
    kind: 'keyboard',
    // event.code → the ASCII-ish key code chips' c64_key_down/up expects. The
    // C64 boots in uppercase, so letters map to uppercase ASCII. Special-key
    // codes (cursor, Run/Stop) are reconciled against chips/systems/c64.h in the
    // backend phase; printable ASCII (the "type and see it on screen" path) is
    // exact here.
    codeToKey: {
      KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45, KeyF: 0x46,
      KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4a, KeyK: 0x4b, KeyL: 0x4c,
      KeyM: 0x4d, KeyN: 0x4e, KeyO: 0x4f, KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52,
      KeyS: 0x53, KeyT: 0x54, KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58,
      KeyY: 0x59, KeyZ: 0x5a,
      Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
      Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
      Space: 0x20, Enter: 0x0d, Backspace: 0x08,
      Comma: 0x2c, Period: 0x2e, Slash: 0x2f, Semicolon: 0x3b, Quote: 0x27,
      Minus: 0x2d, Equal: 0x3d,
      // C64 cursor keys: chips uses 0x07 (down) / 0x06 (up) / 0x09 (right) /
      // 0x08 (left) in its examples; verified in the backend phase.
      ArrowUp: 0x06, ArrowDown: 0x07, ArrowLeft: 0x08, ArrowRight: 0x09,
    },
  },

  defaultPanels: ['memory', 'registers', 'output'],
  compatibleToolchains: ['cc65', 'mads'],
  compatibleEmulators: ['chips-c64'],
  // C64 is a 6502-family CPU (6510); the generic Atari 6502 debug adapter is
  // CPU-shape-generic and serves it verbatim until a labelled debug-c64 lands —
  // same precedent as machine-nes.
  compatibleDebugAdapters: ['atari-6502-debug'],

  media: {
    formats: ['prg'],
    extToFormat: { prg: 'prg' },
    defaultFormat: 'prg',
    // A .prg has no magic — the first two bytes are the little-endian load
    // address. cc65's c64 target starts at $0801 (the BASIC SYS stub), so a
    // leading $01 $08 is the reliable tell for the programs this IDE produces.
    detect(bytes) {
      if (bytes.length >= 2 && bytes[0] === 0x01 && bytes[1] === 0x08) return 'prg'
      return undefined
    },
  },

  // Common C64 KERNAL / VIC equates injected into new MADS projects (the cc65
  // C path uses the bundled headers instead). Mirrors the Atari/NES convention;
  // MADS sources `icl 'src/c64.a65'`.
  bootEquates: {
    path: 'src/c64.a65',
    content: `; common C64 VIC-II / KERNAL equates
VICBASE = $D000
BORDER  = $D020
BGCOL0  = $D021
SID     = $D400
CIA1    = $DC00
CIA2    = $DD00
CHROUT  = $FFD2
GETIN   = $FFE4
CHRIN   = $FFCF
`,
  },
}
