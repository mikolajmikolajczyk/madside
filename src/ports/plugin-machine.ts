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

export interface BootEquates {
  /** POSIX path relative to project root. Seed projects place these under
   *  src/<machine>.a65 (e.g. src/atari.a65). */
  path: string
  /** Plain-text equates. */
  content: string
}

export interface MachinePlugin {
  readonly id: string
  readonly name: string
  readonly cpu: CpuId
  readonly memoryMap: MemoryRegion[]
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
  /** Optional file the seed-project flow injects into new projects. */
  readonly bootEquates?: BootEquates
}
