---
title: Validating your plugin
description: Contract test harnesses and the patterns for testing each plugin kind.
sidebar:
  order: 12
---

Each plugin contract is small enough to test directly. Every plugin kind now ships an `assert<Kind>Plugin` harness — drop in a one-liner for the shape check, then add a behaviour test where it matters. The harnesses live under `@ports/test/`, and built-in plugins use the same ones — so your test fails on the exact drift a built-in's would.

The full set exported from `@ports/test`: `assertToolchainPlugin`, `assertEmulatorPlugin`, `assertDebugAdapterPlugin`, `assertMachinePlugin`, `assertPanelPlugin`, `assertConverterPlugin`, `assertEditorPlugin`, plus the ADR-0007 event helpers (`assertExactlyOneEvent`, `assertNoEvent`, `captureEvents`).

## Toolchain — `assertToolchainPlugin`

The toolchain harness is the most complete. One call validates the static shape, the build round-trip, and the failure path:

```ts
import { describe, it } from 'vitest'
import { assertToolchainPlugin } from '@ports/test'
import { myToolchain } from './my-toolchain'

describe('my-toolchain satisfies ToolchainPlugin', () => {
  it('contract', () =>
    assertToolchainPlugin(myToolchain, {
      source: { path: 'src/main.a65', content: new TextEncoder().encode('  org $2000\n  rts\n  run *\n') },
      badSource: { path: 'src/broken.a65', content: new TextEncoder().encode('@@@ not valid\n') },
    }))
})
```

The fixture is `{ source, badSource?, projectId? }`:

- `source` — a minimal input the plugin **must** accept (path uses one of the plugin's `inputExt`).
- `badSource` — optional input the plugin **must** reject; strongly encouraged.
- `projectId` — forwarded to the plugin (default `'test-harness'`).

What it checks: the id is a kebab-case slug, `name`/`inputExt`/`outputExt` shapes, the build returns `ok: true` + `exitCode: 0` + a non-empty `Uint8Array` binary, and — if `badSource` is supplied — that the failure path returns `ok: false`, `exitCode !== 0`, and no binary. Optional `sourceMap` / `labels`, when present, are checked to be `Map`s.

The built-in MADS plugin runs through exactly this harness — see `tests/plugins/toolchain-mads/contract.test.ts` for a full example (it shims `fetch` to serve the wasm from disk in the Node test env).

## Service↔UI sync — event assertions

If your plugin owns a state machine (or you want to assert a service emits correctly), use the ADR-0007 event helpers from `@ports/test`:

```ts
import { assertExactlyOneEvent, assertNoEvent, captureEvents } from '@ports/test'

// Legal transition: exactly one event with the expected payload.
const got = await assertExactlyOneEvent(
  (cb) => events.on('run:state', cb),
  async () => svc.run(),
)
expect(got).toEqual({ status: 'running', prev: 'loaded' })

// Illegal transition: no event leaks even if the call throws.
await assertNoEvent(
  (cb) => events.on('run:state', cb),
  () => expect(() => svc.run()).toThrow(),
)
```

`captureEvents(subscribe, action)` returns every payload observed during `action`, so you can match the shape yourself. This is the harness that catches the "silent missed emit" bug class ADR-0007 exists to prevent.

## The other harnesses

Beyond toolchain, every kind has a static-shape `assert<Kind>Plugin` — call it with the plugin (some take a fixture). Use it for the shape check, then add behaviour tests for the parts the harness can't reach.

```ts
import {
  assertConverterPlugin,
  assertEditorPlugin,
  assertPanelPlugin,
  assertMachinePlugin,
  assertDebugAdapterPlugin,
  assertEmulatorPlugin,
} from '@ports/test'

it('converter shape', () => assertConverterPlugin(myConverter))
it('editor shape', () => assertEditorPlugin(myEditor))
it('panel shape', () => assertPanelPlugin(myPanel))
it('machine shape', () => assertMachinePlugin(myMachine))
it('debug adapter', async () =>
  assertDebugAdapterPlugin(myAdapter, await jsnesEmulator.createBackend()))
it('emulator', async () => assertEmulatorPlugin(myEmulator)) // { boots: false } for wasm cores
```

What each checks, and what to add on top:

- **`assertConverterPlugin(mod)`** — validates `meta.id` slug, non-empty `inputExt`, `optionsSchema` is an array, `convert` is a function. Add: feed known bytes through `convert(input, opts)` and assert on `output.bytes` (and `summary` if you rely on it) — it's a pure function, trivial to test.
- **`assertPanelPlugin(panel)`** / **`assertEditorPlugin(mod)`** — validate the static shape (slug id, title/label, exactly one of `Component`/`mount` for panels, `fileExt` shape). Add: mount into a JSDOM container, fire the events you subscribe to, assert on the rendered output; call the `destroy` callback and assert cleanup.
- **`assertMachinePlugin(machine)`** — validates descriptor shapes (id slug, `memoryMap` regions well-formed with `start ≤ end`, display/audio/input, plugin-id reference arrays, `memorySpaces`). Add: `media.detect` returns expected ids for sample magic bytes, `bootEquates` matches your seed copy.
- **`assertDebugAdapterPlugin(plugin, backend)`** — pass a headless-bootable backend (e.g. `await jsnesEmulator.createBackend()`); it `attach`es and asserts the `DebugTarget` exposes the right descriptors + methods (`step` / `getPC` / `readMemory` / …).
- **`assertEmulatorPlugin(plugin, opts?)`** — static shape, then (unless `{ boots: false }`) a `RunBackend` round-trip: `createBackend`, framebuffer dimensions, and the full method set. Add: load a tiny known binary, `advanceFrame`, assert the framebuffer and PC; round-trip `saveState` / `loadState`. Wasm cores that can't instantiate headless pass `{ boots: false }` for shape-only.

Put built-in plugin contract tests under `tests/plugins/<plugin>/`; co-locate project-local plugin tests with the plugin source.
