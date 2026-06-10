# ADR-0005: Testing strategy — contract + headless integration hybrid

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, testing

## Context

Madside has no automated tests today. Twelve phases of rapid iteration produced a working app, but the only verification mechanism is "Mikołaj runs `npm run dev` and clicks". That worked when the app was a single Atari pipeline. It will not work as M3-services turns the workbench into a set of pluggable contracts, M4 splits the Atari implementation into a MachinePlugin, and M9 ships a second machine (NES) end-to-end with zero workbench changes.

Specifically: "zero workbench changes for a new machine" is only verifiable by tests. Without them, M9 risks shipping a workbench that secretly knows about Atari, and we won't notice until plugin author #3 hits the same wall.

ADR-0001 (plugin architecture) and ADR-0002 (layering) created the testable surfaces — ports, services, plugin contracts. ADR-0003 (plugin host) defined the boundaries. ADR-0004 (error boundaries) defined the failure semantics. This ADR commits to *what we test, with what runner, and against what fixtures.*

The conversation that produced this decision is recorded in issue `138303a` history; this ADR is the canonical record.

## Decision drivers

- **Plugin contracts must be enforceable from the outside.** A plugin author should be able to run a single command and learn "my MachinePlugin doesn't satisfy the contract" — without depending on the workbench team noticing.
- **No React component tests.** They are brittle for UI that is still iterating heavily, and they cost more to maintain than they catch. Solo dev — opportunity cost is high.
- **Headless workbench is a hard requirement.** Tests that boot a real React tree and a real DOM to verify "service produced binary" are too slow and too entangled. ADR-0002 already mandates a headless `createWorkbench()`; tests are one of its primary consumers.
- **Solo dev, no CI gate, no coverage target.** Tests serve correctness, not metrics. We don't pad numbers; we test what would fail silently.
- **Defer E2E without painting ourselves into a corner.** Playwright is the right tool but adds infra cost. We design the app so E2E is easy to bolt on when the time comes — but we don't bolt it on now.
- **Fast feedback loop.** Vitest is Vite-native, shares the build pipeline, runs in `< 1 s` for the units we have. Anything slower than that and we'll skip running tests, which defeats the point.

## Considered options

1. **Minimal smoke (one E2E only).** Single Playwright golden path — open seed project, build, run, hit a BP. Rejected: catches gross regressions only; says nothing about plugin contracts. Doesn't help M9 validation.
2. **Classic test pyramid.** Lots of Vitest units, fewer integrations, few E2E. Rejected: React-heavy app with jsdom = brittle component tests, marginal value vs cost for UI that changes weekly.
3. **Testing Trophy (Kent C. Dodds).** Mostly integration tests via React Testing Library + jsdom. Rejected: spends test budget on UI shape, not the plugin contract layer which is where regressions will actually hurt.
4. **Contract-first only.** Each plugin kind ships a fixture suite. Author runs `assertMachinePlugin(myPlugin)` and gets pass/fail. Rejected as the only approach: misses regressions in glue code (services, registries, wiring).
5. **Contract + headless integration hybrid (chosen).** Vitest runs four layers: pure-logic units in `@core`/`@ports`, in-process integration via `createWorkbench()` + memory adapters, contract harnesses per plugin kind, plus one or two Playwright golden paths added later. Stops short of React component tests.

## Decision outcome

Adopt the four-layer Vitest hybrid below. Playwright deferred to a later milestone but the app stays E2E-friendly from day one.

### Layer 1 — Pure-logic units

Where: alongside source files as `*.test.ts`. Target: only modules where complexity *actually* warrants a unit test. Not every utility function.

Initial list:

- `@core/hash` — sha256 stability across input shapes (string vs Uint8Array).
- `@core/hex` — formatting/parsing edge cases (negatives, > 16-bit, leading zeros).
- `@core/path` — basename/dirname/extOf on edge inputs.
- MADS source-map parser (post-reorg: `@adapters/wasm-mads/sourceMap`) — the parser that resolves `.lst` lines to addresses, including the include-stack heuristic. This is where future regressions are subtle and silent.
- Recipe engine hashing — verify the same recipe + same inputs yields the same hash (drives the "only rerun affected recipes" optimisation, see issue `0b0a786`).
- Plugin loader (`@adapters/plugin-loader/`) — Blob URL + dynamic import path, including the cache + invalidation behaviour.

Anything with branching logic that returns a value gets tested. Glue code (a hook that wires a service into a component) does not.

### Layer 2 — Headless integration via `createWorkbench()`

Where: `tests/integration/*.test.ts`. Each test boots a workbench with memory adapters and exercises one service end-to-end. No DOM, no React, no Vite dev server.

```ts
const wb = createWorkbench({
  projectRepo: new MemoryProjectRepository(),
  logger: new NoopLogger(),
  pluginRegistry: defaultRegistry(),
  // ... other ports
});
const result = await wb.buildService.build(helloProject);
expect(result.ok).toBe(true);
expect(result.binary.byteLength).toBeGreaterThan(0);
```

Targets:

- BuildService against a real MADS plugin + memory ProjectRepository: assembles a hello-world XEX.
- RunService: loads a binary into the emulator backend, advances N frames, asserts CPU state.
- DebugService: sets a BP, steps, asserts PC.
- AssetPipelineService: runs a recipe end-to-end through a built-in converter.
- ProjectRepository contract: same suite runs against both MemoryProjectRepository and IdbProjectRepository (with `fake-indexeddb`) — must produce identical results.

This is where the bulk of regression coverage lives.

### Layer 3 — Plugin contract harnesses

Where: `@ports/test/<kind>.ts`. Each plugin kind exports an `assert<Kind>Plugin(impl)` function. The harness pokes the plugin against every contract method, validates types, and reports the first violation.

```ts
// @ports/test/machine.ts
export function assertMachinePlugin(p: MachinePlugin): void {
  expect(p.id).toMatch(/^[a-z0-9-]+$/);
  expect(p.display.width).toBeGreaterThan(0);
  // ... full contract
}
```

Built-in plugins use the same harness in their own test files:

```ts
// src/plugins/machine-atari-xl/atari-xl.test.ts
import { assertMachinePlugin } from '@ports/test';
import { atariXl } from './atari-xl';

test('atari-xl satisfies MachinePlugin', () => {
  assertMachinePlugin(atariXl);
});
```

External plugin authors ship the same one-line test in their plugin repo. The harness ships as part of `@ports` (and, post-M8, as the `@madside/plugin-api` package).

### Layer 4 — Playwright golden path (deferred)

One or two end-to-end tests in a real browser. Boot the Vite preview, open the seed project, build, run, hit a BP, verify a value in the memory view. Catches the integration cracks the other layers can't see (audio routing, COOP/COEP headers, real wasm in a real browser).

Deferred until after M3-services lands — there's not enough stable surface to write meaningful E2E against today. The "E2E-ready guardrails" issue (`7659319`) keeps the app paintable.

### What we do not test

- React component rendering.
- Visual regression / snapshot tests.
- jsdom-mediated DOM tests.
- Mocked GPG / IDB / wasm at the unit level (use the real fake-indexeddb; use the real wasm in integration).

If a regression would be caught by one of these, surface it in a Playwright E2E later, not in a unit test now.

### Stack

- **Vitest** for layers 1–3. Vite-native, sub-second runs, shares config.
- **fake-indexeddb** for IDB in tests — in-memory replacement, supports the full IDB API.
- **happy-dom** only if a test genuinely needs a DOM. Default: don't import it. Headless workbench should suffice.
- **Playwright** for layer 4 when it lands. Chromium-only at v1 to keep CI minutes (when CI lands) cheap.
- **MSW (Mock Service Worker)** — no. We don't have a backend.

### Memory adapters as test fixtures

Three memory adapters land alongside the IDB ones as part of Foundation:

- `MemoryProjectRepository` implements `ProjectRepository`.
- `NoopLogger` implements `Logger`.
- `InMemoryClock` (and friends) for time-dependent code paths.

These are not "test-only" — they're shipped in `@adapters/memory/` and used wherever the app benefits (e.g. a future CLI mode that doesn't want IDB). Tests get them for free.

### Coverage targets

None. Solo dev. Adding a coverage threshold turns tests into a goal-displacement game where contributors add empty tests to clear the bar.

Instead: a Foundation expectation that **every service has at least one Layer-2 integration test**, **every plugin kind has a Layer-3 contract harness**, and **every pure-logic module with branching gets a Layer-1 unit**. Reviewed by eye, not by tool.

### E2E-ready guardrails (apply continuously)

Even before Playwright lands, the app stays E2E-friendly so that when E2E does land, we don't rewrite half of it:

- **Stable `data-testid` on user-action surfaces** — toolbar buttons, file tree rows, panel tabs, modal confirms. Added as features land.
- **No `Math.random` / timestamp-derived IDs in render code paths.** Use stable hashes or props.
- **Debounces and timers injectable.** Service constructors take an optional clock/timer; default is real, tests pass fake.
- **AudioContext + wasm bootstrap behind ports** so a Playwright runner can stub or await known ready signals.
- **Seed project deterministic** — same file hashes on every fresh install.
- **URL-loadable state** — `?project=hello` or similar so E2E doesn't drive multi-modal setup.

Tracked as the standalone issue `7659319`.

## Migration

- Vitest config + `pnpm test` script land in Foundation (`Testing infrastructure` is this very ADR's implementation issue, `138303a`).
- First Layer-1 unit: MADS source-map parser. Proves Vitest works.
- Memory adapters land alongside their IDB counterparts during the storage repository port refactor.
- Headless workbench (`createWorkbench()`) lands during the headless workbench Foundation issue. First Layer-2 test: build hello-world.
- Contract harnesses land per plugin kind alongside that kind's epic (M4 ships `assertMachinePlugin`, M5 ships `assertToolchainPlugin`, M7 ships panel/editor harnesses).
- Playwright milestone opens after M3-services completes.

## Positive consequences

- Plugin authors validate against the contract independently — the "M9 NES proof" is largely automated.
- Service refactors during M3 have a safety net — change the wiring, run `pnpm test`, see immediately what broke.
- Memory adapters double as test infrastructure and as production code paths (future CLI, future cloud sync mock).
- Headless workbench is forced into existence by the testing strategy, which makes it real instead of aspirational.
- Vitest sub-second feedback means tests actually run during development.

## Negative consequences

- No React component test net. If `App.tsx` regresses in a way the eye misses, no automated catch. Mitigated by the headless integration tests (most logic doesn't live in `App.tsx` after the hooks split anyway).
- Playwright absence means real-browser issues (audio routing, real wasm timing, real `AudioContext` quirks) escape until E2E lands. Accepted trade-off — Playwright cost outweighs benefit today.
- Contract harnesses are extra surface to maintain. Mitigated by the fact that contract churn after M3-services should be slow — the whole point of the testing layer is to flag unintended changes.
- The "no coverage target" rule means peer pressure (or lint rules) need to catch under-tested services. On a solo project, this is "Mikołaj reviews honestly".

## Open questions

- **CI runner choice.** GitHub Actions on the mirror is the obvious answer (it's free, mirror already planned). But CI for solo dev = bureaucracy. Decision: skip CI until the first non-trivial regression that local testing missed. Local `pnpm test` is enough until then.
- **Test data location.** Probably `tests/fixtures/`. Solidify when fixtures grow past three.
- **Snapshot tests** — likely never. If a use case appears (e.g. "this xex bytes-exact"), add per-test with the binary inline; don't introduce snapshot files.

## Links

- Foundation epic: `b1236bb`
- This issue: `138303a`
- ADR-0001 — Plugin-based retro-development workbench
- ADR-0002 — Layering rules (defines testable surfaces)
- ADR-0003 — Plugin host model
- ADR-0004 — Error boundary strategy (defines what failure modes tests should exercise)
- Issue `7659319` — E2E-ready guardrails (kept honest by ongoing review)
- Issue `0b0a786` — affected-recipes recipe-engine hashing (Layer-1 unit candidate)
