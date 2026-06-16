// MachinePlugin contract (ADR-0001, v0.4.0). Describes target hardware so the
// workbench can stay machine-agnostic. Atari-XL ships as the first
// implementation in @plugins/machine-atari-xl. NES (v1.0.0) is the validation
// target.
//
// Sub-issues whittle hardcoded constants out of @adapters / @ui into this
// contract over the v0.4.0 milestone — display dims (7353947), sample rate
// (c2dc46b), KBCODE table (33eb166), memory map (7f0c7f4), hardware-config
// (40e0373), boot equates (c4f26da), loader formats (3b73e5d), sendKey
// (c5aaf5a), pixel pack (4bd1338).

import type { PluginBase } from './plugin-registry'

export type CpuId = 'mos6502' | 'mos6510' | 'ricoh-2a03' | string

export type MemoryRegionKind = 'ram' | 'rom' | 'io' | 'mirror' | 'unmapped'

export interface MemoryRegion {
  /** First address inclusive. */
  start: number
  /** Last address inclusive. */
  end: number
  /** Short label shown in the memory viewer. */
  name: string
  kind: MemoryRegionKind
  writable: boolean
  /** Optional sub-chip / register hint surfaced on hover. */
  chip?: string
}

export type InputLayoutKind = 'keyboard' | 'controller' | 'mixed'

export interface InputLayout {
  kind: InputLayoutKind
  /** Browser KeyboardEvent.code → machine-side numeric keycode. The numeric
   *  shape stays opaque to the workbench — emulator plugins decode it. */
  codeToKey?: Record<string, number>
  /** Optional buttons for controller-based machines. */
  buttons?: string[]
}

export interface DeviceDescriptor {
  /** Stable id, e.g. 'pokey', 'antic', 'gtia', 'ppu'. */
  id: string
  /** Human-readable name shown in any UI that surfaces devices. */
  name: string
  /** Optional addr-range hint — usually a subset of memoryMap io regions. */
  ioRange?: { start: number; end: number }
}

/** A named address space beyond the CPU bus. The CPU space ('cpu') is implicit
 *  and always present — this declares the *extra* spaces a machine exposes for
 *  inspection (NES PPU VRAM + OAM, C64 VIC, …). A backend's `readMem(addr,
 *  len, space)` serves them; viewer panels (PPU/sprite/tile) read them by id.
 *  Keeps the workbench core free of any per-device contract: a machine adds a
 *  weird space by declaring it here + honouring it in its backend. */
export interface MemorySpace {
  /** Stable id passed to `readMem` / `readMemory` (e.g. 'ppu', 'oam'). */
  id: string
  /** Human label for a space switcher in a generic memory viewer. */
  label: string
  /** Size in bytes — the address range is [0, size). */
  size: number
}

export interface MachineDisplay {
  width: number
  height: number
  fps: number
  /** Pixel format the emulator delivers. xrgb8888 is what AltirraBackend ships
   *  today; M4 follow-up `4bd1338` may bump to a packed rgba shape. */
  pixelFormat: 'xrgb8888' | 'rgba8888'
}

export interface MachineAudio {
  sampleRate: number
  channels: number
}

/** Media-format identifier table for the machine. Format ids are opaque
 *  strings — workbench dispatches by name, not by enum. detect() peeks the
 *  leading bytes and returns the matching id or undefined. Atari uses
 *  'xex'/'atr'/'car'/'cas'; NES would use 'nes'/'fds'; ZX would use
 *  'tap'/'tzx'/'sna'. RunBackend exposes one loader per format via
 *  `load${Format.toUpperCase()}(bytes)`. */
export interface MachineMedia {
  /** Format ids the machine's emulator knows how to load. */
  formats: readonly string[]
  /** Optional file-extension hint (no leading dot, lowercase). Lets the UI
   *  pre-fill a format from a filename before reading bytes. */
  extToFormat?: Readonly<Record<string, string>>
  /** Magic-byte detection — returns the format id whose magic matches the
   *  leading bytes, or undefined for "unknown — fall back to the format
   *  hinted by file extension or the default". */
  detect(bytes: Uint8Array): string | undefined
  /** Format used when neither extension nor magic matched. */
  defaultFormat: string
}

/** Per-emulator-plugin opaque hardware configuration. Atari maps to
 *  ATHardwareMode / ATMemoryMode / firmware-id numbers; NES would use its own
 *  enum. The workbench just forwards these to the matching EmulatorPlugin
 *  setters at boot — no semantic interpretation here. */
export interface MachineHardwareConfig {
  /** Numeric value forwarded to `EmuBackend.setHardwareMode`. */
  hardwareMode?: number
  /** Numeric value forwarded to `EmuBackend.setMemoryMode`. */
  memoryMode?: number
  /** Internal BASIC enabled at boot. */
  basic?: boolean
  /** Firmware ID forwarded to `EmuBackend.setKernel`. */
  kernel?: number
}

export interface BootEquates {
  /** POSIX path relative to project root. Seed projects place these under
   *  src/<machine>.a65 (e.g. src/atari.a65). */
  path: string
  /** Plain-text equates. */
  content: string
}

export interface MachinePlugin extends PluginBase {
  readonly kind: 'machine'
  readonly id: string
  readonly name: string
  readonly cpu: CpuId
  readonly memoryMap: MemoryRegion[]
  /** Extra address spaces beyond the CPU bus (NES 'ppu'/'oam', …). Optional —
   *  most machines only have the implicit 'cpu' space. Viewer panels read
   *  these via `DebugTarget.readMemory(addr, len, space)`. */
  readonly memorySpaces?: MemorySpace[]
  readonly devices: DeviceDescriptor[]
  readonly display: MachineDisplay
  readonly audio: MachineAudio
  readonly input: InputLayout
  /** Panel ids the machine recommends in default layouts (M7 PanelPlugin
   *  surfacing). Workbench falls back to its own default set when missing. */
  readonly defaultPanels: string[]
  /** Toolchain plugin ids known to target this machine. M5 ToolchainPlugin. */
  readonly compatibleToolchains: string[]
  /** Emulator plugin ids known to host this machine. M4 EmulatorPlugin. */
  readonly compatibleEmulators: string[]
  /** Debug-adapter plugin ids that can debug this machine's CPU. Resolved
   *  through the PluginRegistry, same as compatibleEmulators. */
  readonly compatibleDebugAdapters: string[]
  /** Optional file the seed-project flow injects into new projects. */
  readonly bootEquates?: BootEquates
  /** Hardware-config applied to the emulator backend on boot. Mapped 1:1 to
   *  the EmuBackend setHardwareMode / setMemoryMode / setBasic / setKernel
   *  Embind setters. */
  readonly hardwareConfig?: MachineHardwareConfig
  /** Media-format table — populated when the emulator can load more than
   *  one file format. Workbench dispatches load() through these hooks. */
  readonly media?: MachineMedia
}
