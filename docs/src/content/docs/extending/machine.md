---
title: Machine plugins
description: Describe target hardware — display, memory map, memory spaces, input, media, boot equates.
sidebar:
  order: 6
---

A **machine plugin** describes target hardware so the workbench stays machine-agnostic: display dimensions, audio rate, input layout, the memory map, a media-format dispatch table, and an opaque hardware-config bag. Everything that would otherwise calcify as Atari-specific constants lives here instead.

Machine plugins are **built-in only**. The Atari-XL reference impl is `src/plugins/machine-atari-xl/`; NES is `src/plugins/machine-nes/`.

## The contract

Source: `@ports/plugin-machine.ts`.

```ts
interface MachinePlugin {
  readonly id: string            // 'atari-xl', 'nes', 'c64', …
  readonly name: string
  readonly cpu: CpuId            // 'mos6502' | 'mos6510' | 'ricoh-2a03' | string
  readonly memoryMap: MemoryRegion[]
  readonly memorySpaces?: MemorySpace[]   // extra address spaces beyond the CPU bus
  readonly devices: DeviceDescriptor[]
  readonly display: MachineDisplay
  readonly audio: MachineAudio
  readonly input: InputLayout
  readonly defaultPanels: string[]        // panel ids shown by default
  readonly compatibleToolchains: string[]
  readonly compatibleEmulators: string[]
  readonly bootEquates?: BootEquates
  readonly hardwareConfig?: MachineHardwareConfig
  readonly media?: MachineMedia
}
```

## CPU and display

```ts
display: { width: 320, height: 192, fps: 60, pixelFormat: 'xrgb8888' }
```

`pixelFormat` declares the layout the emulator delivers each frame — `'xrgb8888'` (what the Altirra backend ships today) or `'rgba8888'`. The `Emulator` component reads `display` dims + `pixelFormat` to size the canvas and unpack the framebuffer; nothing is hardcoded. `cpu` keys the shared CPU vocabulary (the 6502 opcode/register tables the editor and debugger reuse).

## Memory map

`memoryMap` drives the memory viewer and breakpoint gutters:

```ts
memoryMap: [
  { start: 0x0000, end: 0x00ff, name: 'ZP',  kind: 'ram', writable: true },
  { start: 0x0100, end: 0xfeff, name: 'RAM', kind: 'ram', writable: true },
  { start: 0xff00, end: 0xffff, name: 'IO',  kind: 'io',  writable: true, chip: 'pia' },
]
```

Each `MemoryRegion` has `start`/`end` (inclusive addresses), a short `name`, a `kind` (`ram`/`rom`/`io`/`mirror`/`unmapped`), `writable`, and an optional `chip` hint surfaced on hover.

## Memory spaces

The CPU bus is the implicit `'cpu'` space. Machines that expose *extra* address spaces for inspection — NES `ppu` VRAM + `oam`, C64 `vic` — declare them here:

```ts
memorySpaces: [
  { id: 'ppu', label: 'PPU VRAM', size: 0x4000 },
  { id: 'oam', label: 'OAM',      size: 0x0100 },
]
```

A `MemorySpace` is `{ id, label, size }` (the range is `[0, size)`). Viewer panels read a space by passing its `id` to `DebugTarget.readMemory(addr, len, space)`; the backend serves it (and throws on an unknown space). This keeps the workbench core free of any per-device contract — a machine adds a weird space by declaring it here and honouring it in its backend. See the [panel guide](/docs/extending/panel/#memory-spaces) and the [Reference](/docs/reference/) memory-space table.

## Devices

`devices` is an array of optional sub-chip hints — `{ id, name, ioRange? }` for POKEY, ANTIC, GTIA, PPU, etc. Purely descriptive; surfaced wherever the UI lists devices.

## Input

```ts
input: {
  kind: 'keyboard',                    // 'keyboard' | 'controller' | 'mixed'
  codeToKey: { KeyA: 0x3f, Space: 0x21 },  // KeyboardEvent.code → machine keycode
  buttons: ['A', 'B', 'Start', 'Select'],  // for controller machines
}
```

`codeToKey` maps a browser `KeyboardEvent.code` to a machine-side numeric keycode. The numeric value stays opaque to the workbench — the emulator plugin decodes it via `sendKey`.

## Media

When the emulator can load more than one file format, declare a `MachineMedia` table:

```ts
media: {
  formats: ['xex', 'atr', 'car', 'cas'],            // opaque format ids
  extToFormat: { xex: 'xex', atr: 'atr' },          // optional filename hint
  detect(bytes) { /* peek magic bytes → format id | undefined */ },
  defaultFormat: 'xex',                              // when neither ext nor magic matched
}
```

On load, `RunService` calls `media.detect(bytes)` to pick a format id and forwards it to `RunBackend.loadMedia(format, bytes)`. Format ids are opaque strings — the workbench dispatches by name, never by enum. Atari ships `xex`/`atr`/`car`/`cas`; NES would ship `nes`/`fds`.

## Hardware config

`hardwareConfig` is an opaque bag forwarded 1:1 to the emulator backend's setters at boot — the workbench does not interpret it:

```ts
hardwareConfig: { hardwareMode: 2, memoryMode: 1, basic: false, kernel: 0 }
```

These map to `setHardwareMode` / `setMemoryMode` / `setBasic` / `setKernel` on the backend. Each emulator family defines its own enum values.

## Boot equates

`bootEquates` lets the seed-project flow inject machine-specific equates into freshly created projects:

```ts
bootEquates: { path: 'src/atari.a65', content: 'SAVMSC = $58\nCOLOR0 = $02C4\n' }
```

`path` is project-relative; `content` is plain-text equates (`SAVMSC`, `COLOR0`, …). A contract test (`tests/contract/machine-boot-equates.test.ts`) catches drift between the plugin's equates and the seed copy.

## Compatibility + default panels

- `compatibleToolchains` / `compatibleEmulators` — ids known to target/host this machine; used for selection and validation.
- `defaultPanels` — panel ids the machine recommends when a project doesn't list its own.

## Registering + selecting

```ts
plugins.register({ plugin: { ...helloMachine, kind: 'machine' }, source: { origin: 'builtin' } })
```

```jsonc
{ "version": 2, "machine": "hello" }
```

The workbench's machine-selection table pairs each `MachinePlugin` with its emulator backend factory and debug adapter; switching the manifest's `machine` swaps all three. See `src/app/createWorkbench.ts` for the wiring, and the [emulator](/docs/extending/emulator/) and [debug adapter](/docs/extending/debug-adapter/) guides for the pieces a machine pairs with.
