# MachinePlugin

> Source: [`packages/ports/src/plugin-machine.ts`](../../packages/ports/src/plugin-machine.ts). Atari-XL reference impl: [`packages/machine-atari-xl/src`](../../packages/machine-atari-xl/src).

Describes target hardware so the workbench stays machine-agnostic. Display dims, audio sample rate, input layout, memory map, media-format dispatch table, hardware-config bag — everything that would otherwise calcify as Atari-specific constants in `@adapters` / `@ui`.

## Contract (abridged)

```ts
interface MachinePlugin {
  id: string                       // 'atari-xl', 'nes', 'c64', ...
  name: string
  cpu: CpuId                       // 'mos6502' | 'ricoh-2a03' | ...
  memoryMap: MemoryRegion[]        // for the memory viewer + bp gutters
  devices: DeviceDescriptor[]      // optional sub-chip hints (POKEY, ANTIC, ...)
  display: { width, height, fps, pixelFormat }
  audio: { sampleRate, channels }
  input: InputLayout               // codeToKey?: Record<string, number>; buttons?
  defaultPanels: string[]          // panel ids the workbench shows by default
  compatibleToolchains: string[]
  compatibleEmulators: string[]
  bootEquates?: { path, content }
  hardwareConfig?: { hardwareMode?, memoryMode?, basic?, kernel? }
  media?: MachineMedia             // formats + detect() for loadMedia dispatch
}
```

## Hello-world

```ts
import type { MachinePlugin } from '@ports'

export const helloMachine: MachinePlugin = {
  id: 'hello',
  name: 'Hello Machine',
  cpu: 'mos6502',
  memoryMap: [
    { start: 0x0000, end: 0x00ff, name: 'ZP', kind: 'ram', writable: true },
    { start: 0x0100, end: 0xfeff, name: 'RAM', kind: 'ram', writable: true },
    { start: 0xff00, end: 0xffff, name: 'IO', kind: 'io', writable: true },
  ],
  devices: [],
  display: { width: 320, height: 192, fps: 60, pixelFormat: 'xrgb8888' },
  audio: { sampleRate: 44100, channels: 1 },
  input: { kind: 'keyboard' },
  defaultPanels: ['registers', 'memory'],
  compatibleToolchains: ['mads'],
  compatibleEmulators: ['hello-wasm'],
}
```

Register at workbench construction:

```ts
plugins.register({
  plugin: { ...helloMachine, kind: 'machine' },
  source: { origin: 'builtin' },
})
```

Project manifest selects it:

```jsonc
{ "version": 2, "machine": "hello", ... }
```

## Notes

- The `media` block is optional. When present, `RunService.load` calls `media.detect(bytes)` to pick the format id and forwards it to `EmuBackend.loadMedia(format, bytes)`. Atari ships `'xex' | 'atr' | 'car' | 'cas'`; NES would ship `'nes' | 'fds'`.
- `hardwareConfig` numeric fields are forwarded 1:1 to per-emulator setters (`setHardwareMode`, `setMemoryMode`, `setBasic`, `setKernel`). Opaque enum — the workbench doesn't interpret.
- `bootEquates` lets the seed flow inject machine-specific equates (`SAVMSC`, `COLOR0`, …) into freshly-created projects.

## Drift test

See `tests/contract/machine-boot-equates.test.ts` for the contract test that catches `bootEquates` drift against the seed copy.
