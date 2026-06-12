# ADR-0007: Service ↔ UI sync via state machines + events

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, ui, events

## Context

Two real bugs in v0.7.0 shared a single root cause:

- `ce0dc6f` — Step button bumped a `stepTick` counter; `Emulator.tsx` called `emu.step()` directly without emitting `debug:step-done`. Panels subscribed to the event never refreshed; the registers panel showed stale values until the next Run + BP hit.
- `da6299d` — The pause-time cleanup in `Emulator.tsx` updated React state but did not fire `debug:step-done`. Same symptom. Same week. The `debug:bp-hit` handler in `App.tsx` discarded the event payload and called `setBrokeOn(null)` — the status-bar BP indicator never showed.

The pattern: **UI keeps React state that parallel-tracks service state, and the synchronization is done by hand. Missed emits go silent. The bug surfaces in whichever panel reads the stale shadow.**

`useState` + manual setter calls became the de-facto API for sync between services and panels. There is no contract that says "every state-changing service operation fires exactly one event"; there is no code path that says "this is the only way the UI learns about a transition". A new contributor (or AI agent) reading the code can plausibly introduce a third `running` flag for some local concern, and it will work until the day it doesn't.

A third-party plugin ecosystem will eventually consume these contracts (via Blob URL loader from external repos — the M8 workspace split was cancelled 2026-06-12, see [decisions](../decisions/2026-06-12-monorepo-split-cancelled.md)). If the smell isn't fixed before external authors arrive, every plugin author downloads it baked in.

## Decision drivers

- **One source of truth per domain.** The Run lifecycle has exactly one canonical state, and it lives in `RunService`. The UI is a view of the service, never an authoritative parallel state.
- **Events are the wire.** Services emit typed events on the `EventBus` on every state transition. UI subscribers consume them; no polling, no direct backend reads.
- **Catchable at review.** The rule must be small enough that a checklist (or eventually an ESLint rule) flags violations.
- **Solo-friendly.** Pattern must work without xstate or Redux. Adding a heavy state-management dep for a workbench-scale app is overkill and a regression on bundle size.
- **Migration path.** Existing call sites get refactored one domain at a time. Run lifecycle is the reference; debug / build / project follow.

## Considered options

1. **Status quo — manual `useState` + ad-hoc `events.emit()`.** The pattern that produced the two bugs. Rejected: no contract, no enforcement, every new domain repeats the smell.
2. **Adopt xstate (or zustand / redux).** Industry-standard state machines. Rejected: external dep + new mental model for every contributor; workbench-scale state doesn't need it; node_modules bloat fights ADR-0001 "stay small" intent.
3. **Hand-rolled discriminated unions + reducer + `useSyncExternalStore` (chosen).** Native React 18 primitive. Services own their reducer + emit on transition. UI hooks subscribe via the React-native `useSyncExternalStore` API. Zero deps, fully typed, contract testable.
4. **Move all state to a single global store.** Rejected: cross-cutting against ADR-0002's layered services. Each service should own its FSM.

## Decision outcome

Adopt option 3. Codify the rule in three sentences:

> Every domain (run, debug, build, project, file) has exactly one finite state machine, owned by its service. Every transition emits exactly one typed event on `EventBus` before returning. UI components read state through `useSync*` hooks that subscribe to `EventBus`; they never hold parallel React state for the same domain concept.

### Concretely

- Service exposes:
  - `readonly status: ServiceStatus` (read-only getter)
  - `subscribe(listener: () => void): Unsubscribe` (or shares `events.on('domain:state', ...)`)
  - One or more `transition()` methods that internally drive the reducer + emit the event
- UI exposes one custom hook per service that wraps `useSyncExternalStore`:
  ```ts
  export function useRunStatus(): RunStatus {
    const wb = useWorkbench()
    return useSyncExternalStore(
      (cb) => wb.run.subscribe(cb),
      () => wb.run.status,
      () => 'idle',
    )
  }
  ```
- Components consume via the hook. There is no `[running, setRunning] = useState(false)` for the same concept anywhere downstream.

### Run lifecycle (reference)

```
        ┌───────┐  load(binary)  ┌────────┐  run()    ┌─────────┐
        │ idle  │ ─────────────▶ │ loaded │ ───────▶  │ running │
        └───────┘                └────────┘           └──┬───┬──┘
            ▲                       ▲     ◀──pause()────┘   │
            │                       │                       │
            │                    reset() / load()           │
            │                                               │
            │  ┌────────┐ pause() / bp-hit ─────────────────┘
            └──│ paused │ ────────────▶ running (run())
               └────────┘
                   │
                   └─ load() / reset() ─▶ loaded

  crashed = terminal; any throw inside backend boot / load transitions to it.
```

Every transition fires `'run:state'` with `{ status, prev }`. No other API toggles the same.

### Anti-patterns (lock in `wiki/agents/conventions.md`)

- `useState` mirroring a service-owned status flag.
- Two parallel sources for one concept (e.g. `App.tsx [running]` AND `RunService.status`).
- Direct backend reads in the UI (`workbench.run.backend()?.cpuState()`); use the service surface that emits.
- Manual `events.emit()` from UI components for transitions services own (Emulator.tsx emitting `debug:step-done` was a regression patch — it lands in `1e38ae3` as the canonical step path moves into `DebugService.step()`).

### Contract test

Per kind under `@ports/test/`:

```ts
assertOneEventPerTransition({
  drive: () => svc.run(),
  observe: 'run:state',
  expect: { prev: 'loaded', status: 'running' },
})
```

Failure mode caught: silent missed emit (the exact bug class behind `ce0dc6f` + `da6299d`).

## Positive consequences

- Adding a new panel in M9 NES requires zero new event wiring — every state transition is already declared at the service layer.
- The "panel stale because Emulator forgot to emit" class of bug becomes impossible: the service owns the emit, UI hooks subscribe by construction, contract tests fail on missed transitions.
- ADR-0002 layering stays clean — services keep their state, UI keeps its view.
- Third-party plugin contracts (`@ports/plugin-*.ts`) carry the canonical sync pattern by construction, regardless of how plugins are distributed (in-tree, Blob URL, future published types package).
- React 18's `useSyncExternalStore` is the right native primitive — no dep churn, no library lock-in.

## Negative consequences

- Each service grows a small reducer + subscriber list (~30 LOC). Adds boilerplate vs the current shorthand.
- Contributor onboarding adds one new mental model: "state lives in the service, UI subscribes". Solo dev = self-teach; future contributors get the pattern from this ADR + `wiki/agents/conventions.md` + the Run reference impl.
- Property-based fuzz layer (separate issue `fcdc6d5`) takes real effort to write — and the value materializes only when the pattern catches a regression. Accepted because the cost of repeated ad-hoc patches is higher.

## Open questions

- **Does DebugService own its own FSM, or does it borrow Run's?** Decision deferred to `1e38ae3` (DebugService.step canonical path).
- **What about cross-domain transitions** (BP-hit transitions Run from `running` → `paused`)? Sketch in the diagram is "events compose" — BP-hit is a Run transition triggered by Debug observing the trap. Lock the wiring shape in `16bf7fd`.
- **Dev-mode observability** lives in `71ddbc8`; this ADR doesn't depend on it but recommends it.

## Links

- Epic `152abfd` — M7.5 Service ↔ UI sync hardening
- Reference impl issue `16bf7fd` — Run lifecycle FSM
- UI hook issue `d369f2a` — `useRunStatus()` via `useSyncExternalStore`
- Migration issue `625ed88` — App.tsx + Emulator
- Contract test issue `c2d5614`
- Root-cause bug commits: `ce0dc6f` (step-button stale registers), `da6299d` (pause + brokeOn payload)
- ADR-0002 — Layering (defines the layer the FSM lives in)
- ADR-0003 — Plugin host model (defines the transport for cross-host events)
- ADR-0004 — Error boundary strategy (defines what `crashed` means and where it surfaces)
