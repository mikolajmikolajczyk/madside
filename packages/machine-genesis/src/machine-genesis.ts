import type { MachinePlugin } from '@ports'

// Sega Mega Drive / Genesis — the first 68000 MachinePlugin (#145, Phase A), the
// "final validation" target: a 32-bit, alien-ISA CPU over a 24-bit bus. Proves the
// machine/toolchain/emulator/debug contracts aren't 8-bit/16-bit-bus-centric.
//
// CPU is the Motorola 68000 (the Z80 sound CPU is out of scope for the asm-first
// validation). Toolchain is clownassembler (asm68k syntax); emulator is Genesis
// Plus GX (gpgx, full system); debug is the m68k adapter — all named below in the
// compatible* hints and resolved through the PluginRegistry at runtime.
//
// ROM bundling is an emulator concern (no `rom` field here), same as ZX/C64.
export const machineGenesis: MachinePlugin = {
  kind: 'machine',
  id: 'genesis',
  name: 'Sega Mega Drive / Genesis',
  cpu: 'm68000',
  // Dual CPU: the 68000 main + the Z80 sound coprocessor. The debugger offers a
  // focused-CPU switch across both (#147 Phase 2).
  cpus: [
    { id: 'm68000', label: 'Motorola 68000', adapter: 'm68k-debug' },
    { id: 'z80', label: 'Z80 (sound)', adapter: 'zx-z80-debug', aux: true },
  ],

  display: {
    // VDP active display: 320×224 (NTSC H40 mode). The emulator backend is the
    // source of truth for live dims + border; this mirrors it for panels.
    width: 320,
    height: 224,
    fps: 60,
    // gpgx renders 0xAARRGGBB (USE_32BPP_RENDERING) — the xrgb8888 blit path.
    pixelFormat: 'xrgb8888',
  },

  audio: {
    // YM2612 (6-channel FM) + SN76489 (PSG), mixed by the emulator at the audio
    // context rate, stereo.
    sampleRate: 44100,
    channels: 2,
  },

  // clownassembler emits a flat ROM (.bin). The emulator backends also accept
  // raw .md/.gen dumps and de-interleave .smd. Without this the run service
  // can't resolve a format and falls back to 'binary', which the backend rejects.
  media: {
    formats: ['bin', 'md', 'gen', 'smd'],
    extToFormat: { bin: 'bin', md: 'md', gen: 'gen', smd: 'smd' },
    defaultFormat: 'bin',
    // .smd interleaved dumps carry a 512-byte header whose bytes 8/9 are $AA/$BB;
    // everything else is treated as a flat ROM.
    detect(bytes) {
      if (bytes.length > 0x200 && bytes[8] === 0xaa && bytes[9] === 0xbb) return 'smd'
      return 'bin'
    },
  },

  // 68000 bus (24-bit). Only the load-bearing regions are mapped; the rest of the
  // 16 MB space is unmapped/mirrored hardware. RAM is the 64K at $FF0000–$FFFFFF
  // (mirrored down through $E00000). The VDP, I/O and Z80 area are register
  // windows, surfaced here as `io` for the memory viewer.
  memoryMap: [
    { start: 0x000000, end: 0x3fffff, name: 'Cartridge ROM', kind: 'rom', writable: false },
    { start: 0xa00000, end: 0xa0ffff, name: 'Z80 sound area', kind: 'io', writable: true, chip: 'z80' },
    { start: 0xa10000, end: 0xa1001f, name: 'I/O (controllers / version)', kind: 'io', writable: true },
    { start: 0xa11000, end: 0xa110ff, name: 'Z80 / bus control', kind: 'io', writable: true },
    { start: 0xc00000, end: 0xc0001f, name: 'VDP ports', kind: 'io', writable: true, chip: 'vdp' },
    { start: 0xe00000, end: 0xffffff, name: '68000 RAM (64K, mirrored)', kind: 'ram', writable: true },
  ],

  // VDP-internal memories — reachable only through the VDP's data/control ports,
  // not the 68000 bus, so they're named spaces (like NES ppu/oam). The emulator
  // backend serves them via readMemory(addr, len, space); tile/palette/sprite
  // viewers read them by id. (Phase B wires the reads; declaring them now keeps
  // the machine description complete.)
  memorySpaces: [
    { id: 'vram', label: 'VDP VRAM', size: 0x10000 },   // 64 KB tiles/maps/sprites
    { id: 'cram', label: 'VDP CRAM (palette)', size: 0x80 }, // 64 entries × 2 bytes
    { id: 'vsram', label: 'VDP VSRAM (v-scroll)', size: 0x50 }, // 40 entries × 2 bytes
  ],

  devices: [
    { id: 'vdp', name: 'VDP (Yamaha YM7101 — video)', ioRange: { start: 0xc00000, end: 0xc0001f } },
    { id: 'ym2612', name: 'YM2612 (FM sound)', ioRange: { start: 0xa04000, end: 0xa04003 } },
    { id: 'psg', name: 'SN76489 (PSG)', ioRange: { start: 0xc00011, end: 0xc00011 } },
    { id: 'z80', name: 'Z80 (sound CPU)', ioRange: { start: 0xa00000, end: 0xa0ffff } },
    { id: 'io', name: 'Controller I/O', ioRange: { start: 0xa10000, end: 0xa1001f } },
  ],

  input: {
    kind: 'controller',
    buttons: ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'C', 'Start'],
    // Keyboard → 3-button pad: arrows for the D-pad, Z/X/C = A/B/C, Enter = Start.
    // Numeric codes are the button indices above; the emulator backend decodes.
    codeToKey: {
      ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3,
      KeyZ: 4, KeyX: 5, KeyC: 6, Enter: 7,
    },
  },

  defaultPanels: ['memory', 'registers', 'variables', 'output'],
  compatibleToolchains: ['clownassembler'],
  // gpgx (full system: VDP/sound/Z80/IO) is the Genesis backend (#145, Phase B),
  // resolved through the PluginRegistry at runtime.
  compatibleEmulators: ['genesis-gpgx'],
  compatibleDebugAdapters: ['m68k-debug', 'zx-z80-debug'],

  // Common Genesis equates injected into new clownassembler projects (asm68k
  // syntax, `include "src/genesis.inc"`).
  bootEquates: {
    path: 'src/genesis.inc',
    content: `; common Sega Mega Drive / Genesis equates (asm68k syntax)
VDP_DATA	equ	$C00000		; VDP data port (word)
VDP_CTRL	equ	$C00004		; VDP control port (word)
VDP_HV		equ	$C00008		; H/V counter (read)
RAM		equ	$FF0000		; 64K work RAM (mirrored from $E00000)
RAM_END		equ	$1000000	; one past the top of RAM
IO_DATA1	equ	$A10003		; controller 1 data
IO_CTRL1	equ	$A10009		; controller 1 control
Z80_RAM		equ	$A00000		; Z80 sound RAM
Z80_BUSREQ	equ	$A11100		; Z80 bus request
Z80_RESET	equ	$A11200		; Z80 reset
`,
  },

  // The 68000 reset vector lives at offset 4 (big-endian long) in the ROM, which
  // maps at $000000 — so the program's entry PC is parsable straight from the
  // binary. The check-runner waits until the PC enters [entry, ROM end] before
  // counting `afterFrames` (#30). Returns null for anything that isn't a Genesis
  // ROM (too small, or no "SEGA" console signature at $100).
  programLoadRange: (binary) => {
    if (binary.length < 0x200) return null
    // "SEGA" console signature at $100 ($100–$103).
    if (binary[0x100] !== 0x53 || binary[0x101] !== 0x45 || binary[0x102] !== 0x47 || binary[0x103] !== 0x41) return null
    const entry = ((binary[4]! << 24) | (binary[5]! << 16) | (binary[6]! << 8) | binary[7]!) >>> 0
    if (entry >= binary.length) return null
    return { lo: entry, hi: binary.length - 1 }
  },
}
