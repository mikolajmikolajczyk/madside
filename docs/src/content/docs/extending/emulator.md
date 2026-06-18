---
title: Emulator plugins
description: The run backend — framebuffer, audio, step, breakpoints, save state.
sidebar:
  order: 8
---

An **emulator** plugin provides the running machine: it loads media, advances frames, exposes the framebuffer and audio, and offers the debug primitives (step, breakpoints, memory). The workbench drives it through `RunService` and observes it through the [debug adapter](/docs/extending/debug-adapter/).

Emulator plugins are **built-in only**.

An emulator ships in two parts: the thin **`EmulatorPlugin`** wrapper (registry-facing, source `@ports/plugin-emulator.ts`) and the **`RunBackend`** it builds (the real work, source `@ports/services/run-service.ts`). The plugin is tiny:

```ts
interface EmulatorPlugin {
  readonly id: string          // 'altirra-wasm', 'jsnes'
  readonly kind: 'emulator'
  readonly name: string
  createBackend(): Promise<RunBackend>   // async: the heavy core loads only on boot
}
```

`createBackend` is deliberately lazy — typically a `() => (await import('./core')).create()` — so the wasm/JS core stays out of the main bundle and is fetched only when an emulator is actually selected. The plugin is registered through the `PluginRegistry` like every other kind; a machine names the one it runs on via `MachinePlugin.compatibleEmulators`, and the workbench resolves `compatibleEmulators[0]` from the registry. The shipped emulators are Altirra (`@adapters/emu`, id `altirra-wasm`) and jsnes (`@plugins/emulator-nes-jsnes`, id `jsnes`).

The rest of this page documents `RunBackend` — the interface your `createBackend` returns.

## The run backend

Source: `RunBackend` in `@ports/services/run-service.ts`. This is the minimal facade `RunService` and the UI frame loop drive:

```ts
interface RunBackend {
  readonly width: number
  readonly height: number
  readonly sampleRate?: number
  readonly pixels: Uint32Array          // the framebuffer the canvas reads each frame

  loadMedia(format: string, bytes: Uint8Array): void   // format is an opaque id from MachinePlugin.media.formats
  advanceFrame(trap?: () => boolean): number            // advance one display frame; returns new PC
  step(): number                                        // advance one CPU instruction; returns new PC
  cpuState(): unknown                                   // register snapshot (shape read by the debug adapter)
  getPC(): number
  isAtInstrBoundary(): boolean
  readMem(addr: number, len: number, space?: string): Uint8Array  // space defaults to the CPU bus
  setBreakpoints(addrs: Iterable<number>): void
  sendKey(keyCode: number, charCode: number, isDown: boolean, modifiers?: number): void
  saveState(): unknown
  loadState(snapshot: unknown): void
}
```

## Framebuffer

`pixels` is a `Uint32Array` of `width * height` pixels in the layout the paired machine declares via `display.pixelFormat` (`xrgb8888` / `rgba8888`). The `Emulator` component reads `pixels` straight into a canvas every frame — you write into the same buffer each `advanceFrame`.

## Audio

`sampleRate` (when present) lets the workbench wire an AudioWorklet sink to the backend's audio tap. The Atari backend feeds POKEY output through an AudioWorklet; an emulator without audio simply omits `sampleRate`.

## Media loading

`loadMedia(format, bytes)` is the single load entrypoint. `format` is an opaque id sourced from the machine's `MachinePlugin.media.formats` — the backend dispatches internally (the Altirra backend forwards to per-format `loadXEX`/`loadATR`/`loadCAR`/`loadCAS` methods). Throw when asked for a format your emulator can't load.

## Step and breakpoints

- `advanceFrame(trap?)` runs one display frame; the optional `trap` is polled so a breakpoint can stop mid-frame. Returns the new PC.
- `step()` advances exactly one CPU instruction.
- `setBreakpoints(addrs)` replaces the breakpoint set; the backend honours the trap on subsequent `advanceFrame` / `step`.
- `isAtInstrBoundary()` reports whether the backend is paused on an instruction boundary (some emulators advance in cycle steps).

On a breakpoint hit, `RunService` pauses and emits `debug:bp-hit`; a completed step emits `debug:step-done`. The debug adapter forwards `step` / `getPC` / `readMem` / register reads through these same methods.

## Save state

`saveState()` returns an opaque snapshot; `loadState(snapshot)` restores it. The workbench treats the snapshot as opaque — round-trip fidelity is the backend's responsibility.

## Input

`sendKey(keyCode, charCode, isDown, modifiers?)` receives keys decoded from the machine's `input.codeToKey` mapping. The numeric `keyCode` is machine-side and opaque to the workbench.

## Memory spaces

`readMem(addr, len, space?)` reads a named memory space; `space` defaults to the CPU bus. If the paired machine declares extra spaces in `MachinePlugin.memorySpaces` (NES `ppu`/`oam`, …), serve them here and throw on an unknown space id. See [Machine plugins](/docs/extending/machine/#memory-spaces).

## Registering + wiring

```ts
plugins.register({ plugin: { ...myEmulator, kind: 'emulator' }, source: { origin: 'builtin' } })
```

A machine names its emulator in `compatibleEmulators`; `createWorkbench` resolves `compatibleEmulators[0]` from the registry and uses its `createBackend` as the `backendFactory` in the machine-selection table, alongside the `MachinePlugin` and the resolved `DebugAdapter`. Switching the project's `machine` swaps all three via `RunService.reconfigure`. See `src/app/createWorkbench.ts` (`resolveEmulatorBackend`) for the wiring.
