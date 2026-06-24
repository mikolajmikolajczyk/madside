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

/** Executable address span of a loaded program (#30). Inclusive bounds. */
export interface ProgramLoadRange {
  lo: number
  hi: number
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

/** A switchable bank window on the CPU bus (ADR-0014, bank-aware debugging).
 *  Distinct from {@link MemorySpace}: a MemorySpace is a *separate flat space*
 *  (NES PPU VRAM, OAM) addressed `[0, size)`; a BankWindow *overlays a range of
 *  CPU-bus addresses* whose backing store switches among `bankCount` banks,
 *  selected live by a hardware register. The debugger projects a CPU address in
 *  `[start, end]` to the physical key `(space:'<prefix><N>', offset)` using the
 *  live selector, and the toolchain source map already tags banked code with the
 *  matching `space:'<prefix><N>'` (Phase 0). So `space` stays the one debug key
 *  (ADR-0014 decision); this only declares *how a machine's window maps to it*.
 *
 *  130XE: one window `$4000–$7FFF`, 4 banks, selector PORTB `$D301` bits 2–3.
 *
 *  The `selector` models the **bus-readable** case (Atari PORTB is a PIA port,
 *  read back via `readMem`). Machines whose bank latch is **write-only** (NES
 *  mapper registers, ZX `$7FFD`) can't use a register read — their phase adds a
 *  core-state path and may leave `selector` undefined; not modelled here to
 *  avoid pre-empting later targets. */
export interface BankWindow {
  /** Stable id for the window. Single-window machines use 'main'. */
  id: string
  /** CPU-bus range the window overlays (inclusive). 130XE: 0x4000–0x7fff. */
  start: number
  end: number
  /** Number of banks that can map into the window. 130XE: 4. */
  bankCount: number
  /** Space-id prefix; bank N → `${spacePrefix}${N}`, matching the source map's
   *  capture (MADS/cc65 emit 'bank{N}'). Defaults to 'bank'. */
  spacePrefix?: string
  /** How to read the live bank index from a bus-readable selector register.
   *  The backend reads `readMem(reg, 1)`, masks, shifts → 0-based bank index.
   *  Omitted for write-only-selector machines (see interface note). */
  selector?: {
    /** CPU-bus address of the selector register. 130XE: 0xd301 (PORTB). */
    reg: number
    /** Mask applied to the register byte. 130XE: 0x0c (bits 2–3). */
    mask: number
    /** Right-shift after masking → 0-based bank index. 130XE: 2. */
    shift: number
    /** Optional gate: the window holds an ext bank only when
     *  `(reg & enableMask) === enableValue`; otherwise it shows main RAM (no
     *  ext bank active). 130XE CPE = bit 4 must be 0 for CPU ext access. */
    enableMask?: number
    enableValue?: number
  }
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
  /** Switchable bank windows on the CPU bus (ADR-0014). Optional — flat
   *  machines omit it. Each window declares its CPU range, bank count, and
   *  (when bus-readable) the live-bank selector. The debugger uses these to
   *  project a CPU address to its physical `(space, offset)` key. */
  readonly banks?: BankWindow[]
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
  /** Optional: parse the loaded program's executable address range from a built
   *  binary, so the headless check-runner can wait out OS cold-boot before
   *  counting `afterFrames` (#30) — the PC entering this range means "the user's
   *  program has started". Machines whose program runs straight from load (NES
   *  seeds PC from the reset vector) omit it; the runner then steps a fixed
   *  number of frames from load, as before. Returns null when the bytes aren't a
   *  recognizable executable for this machine. */
  readonly programLoadRange?: (binary: Uint8Array) => ProgramLoadRange | null
}
