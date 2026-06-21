import type { MachinePlugin } from '@ports'

// Sinclair ZX Spectrum 48K (PAL) — the first non-6502 MachinePlugin (epic #79).
// Validates that the machine abstraction isn't 6502-centric: CPU is Z80, the
// toolchain is z88dk (asm-first), and the debug adapter is Z80-aware (the 6502
// adapter does NOT apply). Pairs with the chips `systems/zx.h` emulator core
// (@plugins/emulator-zx-chips, #82 — reuses the C64 Embind wasm pipeline) and
// the z88dk toolchain (#84, z80asm → appmake → .tap).
//
// ROM: the 48K ROM is Amstrad-redistributable (unlike Commodore's), so it ships
// — handed to the chips core at init by the emulator plugin (#82), same flow as
// the C64 Open ROMs live under emulator-c64-chips/roms/. No `rom` field on the
// MachinePlugin contract; ROM bundling is an emulator concern.

export const machineZx: MachinePlugin = {
  kind: 'machine',
  id: 'zx-spectrum',
  name: 'ZX Spectrum 48K',
  cpu: 'z80',

  display: {
    // chips zx.h emits an RGBA8 framebuffer covering the 256×192 paper plus the
    // border (full visible area). The RunBackend (#82) is the source of truth
    // for live dimensions; these mirror it for panels reading machine metadata.
    width: 320,
    height: 256,
    fps: 50,
    pixelFormat: 'rgba8888',
  },

  audio: {
    // ULA beeper (1-bit), rendered by chips at the audio-context rate. (AY-3-8912
    // is a 128K device — out of scope for 48K.)
    sampleRate: 44100,
    channels: 1,
  },

  // 48K address map. The ULA is reached through I/O port 0xFE (border/beeper/
  // keyboard), NOT a memory-mapped region, so it lives in `devices`, not here.
  memoryMap: [
    { start: 0x0000, end: 0x3fff, name: '48K ROM', kind: 'rom', writable: false },
    { start: 0x4000, end: 0x57ff, name: 'Screen bitmap', kind: 'ram', writable: true },
    { start: 0x5800, end: 0x5aff, name: 'Screen attributes', kind: 'ram', writable: true },
    { start: 0x5b00, end: 0xffff, name: 'RAM', kind: 'ram', writable: true },
  ],

  devices: [
    // The ULA is port-mapped (IN/OUT 0xFE): border colour + beeper (bits 0–4 on
    // write), keyboard half-rows + EAR (on read). No address-bus range.
    { id: 'ula', name: 'ULA (display / border / beeper / keyboard)' },
  ],

  input: {
    kind: 'keyboard',
    // event.code → the ASCII code chips' zx_key_down/up expects. The Spectrum
    // keyboard is an 8×5 matrix with CAPS SHIFT + SYMBOL SHIFT; chips maps the
    // printable set to ASCII. Letters are uppercase ASCII (the "type and see it"
    // path); matrix-only specials (cursor = CAPS+5/6/7/8, etc.) are reconciled
    // in the backend phase (#82).
    codeToKey: {
      KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45, KeyF: 0x46,
      KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4a, KeyK: 0x4b, KeyL: 0x4c,
      KeyM: 0x4d, KeyN: 0x4e, KeyO: 0x4f, KeyP: 0x50, KeyQ: 0x51, KeyR: 0x52,
      KeyS: 0x53, KeyT: 0x54, KeyU: 0x55, KeyV: 0x56, KeyW: 0x57, KeyX: 0x58,
      KeyY: 0x59, KeyZ: 0x5a,
      Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33, Digit4: 0x34,
      Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38, Digit9: 0x39,
      Space: 0x20, Enter: 0x0d, Backspace: 0x0c, // ZX DELETE = CAPS+0 → 0x0c
    },
  },

  defaultPanels: ['memory', 'registers', 'output'],
  compatibleToolchains: ['z88dk'],
  compatibleEmulators: ['zx-chips'],
  // ZX is a Z80 — a different ISA from the 6502 family, so it needs the labelled
  // Z80 debug adapter (#85), not the generic atari-6502-debug.
  compatibleDebugAdapters: ['zx-z80-debug'],

  media: {
    formats: ['tap', 'tzx', 'sna', 'z80', 'scr'],
    extToFormat: { tap: 'tap', tzx: 'tzx', sna: 'sna', z80: 'z80', scr: 'scr' },
    defaultFormat: 'tap',
    // ZX formats have no leading magic strong enough to fingerprint tape images
    // (.tap/.tzx/.z80 are header/structure-driven), so detect what's reliably
    // size-keyed and otherwise return undefined (fall back to extension/default):
    //  - .sna 48K snapshot = exactly 49179 bytes (27-byte header + 48K).
    //  - .scr screen dump  = exactly 6912 bytes (6144 bitmap + 768 attrs).
    //  - .tzx starts with the literal signature "ZXTape!" + 0x1A.
    detect(bytes) {
      if (bytes.length === 49179) return 'sna'
      if (bytes.length === 6912) return 'scr'
      if (
        bytes.length >= 8 &&
        bytes[0] === 0x5a && bytes[1] === 0x58 && bytes[2] === 0x54 && // "ZXT"
        bytes[3] === 0x61 && bytes[4] === 0x70 && bytes[5] === 0x65 && // "ape"
        bytes[6] === 0x21 && bytes[7] === 0x1a                          // "!" 0x1A
      ) return 'tzx'
      return undefined
    },
  },

  // Common ZX equates injected into new z88dk asm projects (sourced via
  // `include "src/zx.inc"`). Mirrors the Atari/C64 bootEquates convention, in
  // z80asm syntax.
  bootEquates: {
    path: 'src/zx.inc',
    content: `; common ZX Spectrum 48K equates (z80asm syntax)
ULA_PORT  equ $fe        ; IN/OUT: border+beeper (write), keyboard+EAR (read)
SCREEN    equ $4000      ; 6144-byte pixel bitmap
ATTRS     equ $5800      ; 768-byte attribute map
ROM_CLS   equ $0daf      ; ROM: clear screen
ROM_PRINT equ $203c      ; ROM: PR-STRING (print DE..BC chars)
CHAN_OPEN equ $1601      ; ROM: open channel (A = stream)
`,
  },
}
