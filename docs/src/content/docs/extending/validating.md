---
title: Validating your plugin
description: Contract test harnesses and the patterns for testing each plugin kind.
sidebar:
  order: 11
---

Each plugin contract is small enough to test directly. Where a shared harness exists, drop in a one-liner; where it doesn't yet, a plain Vitest test against the interface does the job. The harnesses live under `@ports/test/`, and built-in plugins use the same ones — so your test fails on the exact drift a built-in's would.

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

## Kinds without a dedicated harness yet

Converter, editor, panel, machine, debug-adapter, and emulator don't ship a full `assert*Plugin` harness today (machine has a focused drift contract test for `bootEquates`). Test them directly against the interface:

- **Converter** — feed known bytes through `convert(input, opts)` and assert on `output.bytes` (and `summary` if you rely on it). Pure function — trivial to test.
- **Panel / editor** — mount into a JSDOM container, fire the events you subscribe to, assert on the rendered output; call `destroy()` and assert cleanup.
- **Machine** — assert the descriptor shapes (memory map ranges don't overlap, `media.detect` returns expected ids for sample magic bytes, `bootEquates` matches your seed copy).
- **Debug adapter** — `attach` a stub `RunBackend` and assert the `DebugTarget` forwards `step` / `getPC` / `readMemory` correctly and exposes the right descriptors.
- **Emulator (`RunBackend`)** — load a tiny known binary, `advanceFrame`, assert the framebuffer and PC; round-trip `saveState` / `loadState`.

External authors get the harnesses for free as they land. Put built-in plugin contract tests under `tests/plugins/<plugin>/`; co-locate project-local plugin tests with the plugin source.
