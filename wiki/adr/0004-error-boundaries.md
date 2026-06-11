# ADR-0004: Error boundary + degradation strategy

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, errors, runtime, ux

## Context

Today error handling is ad-hoc. Assemble failures land in the output panel. A wasm trap in Altirra can leave the emulator UI in an inconsistent state. A throw from a plugin editor takes down the whole side panel. There is one React error boundary (around `PluginEditor`, tracked as `714938a`) and nothing else; an uncaught throw anywhere in the tree blanks the workbench.

ADR-0001 commits to a plugin ecosystem. ADR-0003 puts heavy plugin kinds in workers with the explicit assumption that "host emits `plugin:crashed` event, registry can reload by re-running step 1". Both ADRs defer the question of *how the user experiences a failure* and *what each layer is allowed to throw* to this one.

Without that policy, every layer invents its own and the plugin contract becomes "throws sometimes, returns `null` other times, occasionally rejects" — uncatchable in practice.

## Decision drivers

- **No silent failure.** A user who types `wrong-instruction` should see an assembler error in the output panel, not a blank screen. A plugin that crashes should fail loudly in *one* panel, not the whole workbench.
- **No catastrophic failure.** A throw in a tile-editor plugin should not lose the project. The path from "something went wrong" to "lose user work" must be deliberately drawn.
- **Predictable plugin contracts.** Plugin authors write to a documented contract: "your `build()` is allowed to throw `BuildError`, `ConfigError`, or `InternalError` — anything else gets reported as crash". No surprise reject vs null vs throw shapes.
- **Layer-appropriate error styles.** Throwing inside `@core` is fine (pure code). At service boundaries we want typed return shapes for expected failures. At the plugin boundary, any unhandled throw is a crash.
- **Recovery beats retry-by-default.** Crashed plugin = empty slot + retry button; auto-retry hides the underlying problem and burns user attention.
- **Solo dev friendly.** No global Sentry / telemetry pipe today. Errors must show enough in the UI + dev console to debug without external infrastructure.

## Considered options

1. **No formal policy.** Each layer/component handles errors as it pleases. Rejected: leads exactly to the current state (silent failures, blank screens, inconsistent plugin contracts).
2. **Result<T,E> everywhere.** Type every fallible API as `Result<T,E>`. Rejected: ergonomically heavy in TypeScript, every call site needs the same boilerplate, errors propagate to UI as much wrapping work as throws. We don't write Rust.
3. **Throws everywhere + try/catch at boundaries.** Inverse of (2). Rejected: harder to know what can throw without reading source; expected-vs-unexpected distinction collapses.
4. **Throw for unexpected, Result for expected, React boundaries at layer transitions (chosen).** Pragmatic mix. Matches React conventions for the UI layer and TypeScript idioms for service-level returns. ESLint boundary enforcement landed in `01c77ab` (eslint-plugin-boundaries).
5. **Catastrophic-only handling.** One root error boundary, otherwise let everything propagate. Rejected: a misbehaving plugin would take down the workbench.

## Decision outcome

Adopt a layered error policy with React boundaries at three levels and a typed contract for service-level expected failures.

### Per-layer error style (matches ADR-0002 layers)

| Layer | Style | Notes |
|-------|-------|-------|
| `core` | Throw on invalid input | Pure, no I/O. Caller validates before calling. |
| `ports` | Types only — declare what implementations may throw | Throws and Result shapes are part of the contract a port publishes. |
| `adapters` | Wrap external errors → typed | IDB failure → `StorageError`. Wasm trap → `EmulatorTrapError`. Network → `NetworkError`. No raw exceptions cross the adapter boundary. |
| `services` | Throw on unexpected (invariant violation), return `Result<T,E>` on expected | E.g. `BuildService.build()` returns `Result<Binary, BuildError>` because failed builds are normal. `BuildService.cancel()` throws if called before a build started — invariant violation. |
| `plugins` | Plugin authors throw whatever they want | The host catches *every* throw at the `PluginEndpoint` boundary and converts it to a `plugin:crashed` event. Plugin code may also use Result if author prefers — but the contract is "any unhandled throw = crash". |
| `app` | Catches `plugin:crashed`, wasm traps, and other infrastructure failures | Decides whether to dispose + offer retry, surface a banner, or escalate to UI boundary. |
| `ui` | React error boundaries at three levels (see below) | Renders error states; never silently catches. |

### Error class hierarchy

Lives in `@ports/errors.ts` (so adapters and services share definitions). Skeleton:

```ts
abstract class WorkbenchError extends Error {
  abstract kind: string; // discriminant
  cause?: unknown;
}

class BuildError extends WorkbenchError { kind = 'build' }
class StorageError extends WorkbenchError { kind = 'storage' }
class EmulatorTrapError extends WorkbenchError { kind = 'emulator-trap' }
class PluginCrashError extends WorkbenchError { kind = 'plugin-crash'; pluginId: string }
class ConfigError extends WorkbenchError { kind = 'config' }
class NetworkError extends WorkbenchError { kind = 'network' }
class InternalError extends WorkbenchError { kind = 'internal' } // bugs we shipped
```

Anything not extending `WorkbenchError` that reaches the UI is an `InternalError` — surfaced as "something went wrong, please report".

### React error boundaries — three levels

**Level 1 — Root boundary.** One around the entire workbench. Catches anything that escapes every lower boundary. Renders: short message, "reload workbench" button, "export project to ZIP" button (so the user doesn't lose work).

**Level 2 — Panel boundary.** One around every panel slot (memory viewer, register viewer, output, editor, emulator canvas, plugin editor mounts). A panel crash shows the panel as broken with a retry button — the rest of the workbench keeps working. Matches ADR-0003: panels run on main thread, so React boundaries are the containment mechanism.

**Level 3 — Plugin mount boundary.** One around every plugin editor mount (already exists as `714938a`-tracked). Shorter retry cycle than panel-level: re-mount the plugin module. If re-mount also crashes, surface as panel-level error.

Boundaries do *not* wrap services or business logic — services live below React and don't render.

### Plugin crashes

ADR-0003 says workers crash → host emits `plugin:crashed`. Main-host plugins crash → React boundary catches. Either way:

1. Plugin instance is disposed.
2. The slot it occupied shows "plugin crashed, click to retry".
3. No auto-retry. The user (or a future "auto-retry up to N times" policy) decides.
4. Sibling plugins are unaffected.
5. The crash is logged via the `Logger` port (see ADR-0001 / Foundation `Logger` issue).

### Wasm trap recovery

Altirra wasm traps are recoverable. Policy:

1. Emulator service catches the trap, transitions state to `crashed`.
2. UI panel shows "emulator crashed at PC=$XXXX — reset?" with a reset button.
3. Reset disposes the wasm instance, instantiates a fresh one, re-loads the last good `loadedXex`.
4. Project / source / breakpoints survive because they live in IDB, not in the wasm memory.
5. Three traps within 30 seconds → escalate to a UI banner "emulator unstable, file a bug" and stop auto-recovery until the user reloads.

MADS wasm doesn't trap in practice (it `proc_exit`s with a code, which is a build failure not a trap). Same recovery hook in case it does — fresh instance, last good binary, no project loss.

### Storage corruption

Adapter-level policy on every IDB read:

1. Schema-validate the record. Use a small validator (zod is fine; can be hand-rolled).
2. If validation fails → quarantine the record (move to `corrupted` store with original key + timestamp), log via `Logger`, return `Result.err(StorageError)` to the caller.
3. Service decides: skip and continue, or surface to UI ("snapshot N could not be loaded — file in `~/.madside/quarantine`").
4. Full-DB corruption (cannot open IDB at all) → UI offers: export anything readable to ZIP, then reinit DB.

No automatic delete of bad records. User-initiated cleanup only.

### Logger contract

Every typed error gets logged at the layer that wraps it:

- adapter wraps → `logger.warn('storage failure', { kind, cause })`
- service detects expected failure → no log (caller will show in UI)
- service detects invariant violation → `logger.error('invariant', { ctx })` + throw
- React boundary catches → `logger.error('boundary caught', { level, err })` in `componentDidCatch`
- plugin crash → host emits event and `logger.error('plugin crashed', { pluginId, kind })`

Logs land in the in-app Output panel via the BufferedLogger adapter (Foundation `Logger` issue defines it). Dev console gets everything. No external telemetry.

### What the user sees

- **Build failed** — output panel shows MADS stderr + a red error line; no banner.
- **Plugin crashed** — that plugin slot only; retry button.
- **Panel crashed** — that panel only; retry button.
- **Emulator trapped** — emulator panel only; reset button.
- **Storage record corrupt** — banner with the affected operation only.
- **Catastrophic / unknown** — full-screen boundary with "reload workbench" and "export to ZIP".

No modal dialogs in any error path. No alerts. Always: banner or panel-level state.

## Positive consequences

- Plugin authors get a one-line contract: "throw on failure, the host handles the rest."
- Crashes are contained to their natural blast radius (plugin, panel, emulator) without spreading.
- User work is protected by structural guarantees (IDB survives wasm traps; export-to-ZIP escape hatch in the root boundary).
- Error classes are typed; ESLint can later forbid `throw new Error(...)` in service code, forcing use of the hierarchy.
- Recovery semantics are explicit and predictable — no hidden auto-retry loops.

## Negative consequences

- Authors must learn the `BuildError` / `StorageError` / `InternalError` discriminants. Mitigated by a single `@ports/errors.ts` and IDE autocomplete.
- Mixing throws + `Result<T,E>` per layer can confuse readers used to one or the other. Mitigated by the per-layer table — when in doubt, follow the layer rule.
- Schema validation on every IDB read has a cost. Negligible for a single-user app on a modern machine; revisit if profiling shows otherwise.
- Three-level React boundaries means more boilerplate at the UI layer. Mitigated with a single `Boundary` wrapper component used by panel + plugin-mount layers.

## Open questions

- **Stack trace fidelity across the worker boundary.** Comlink (ADR-0003) preserves stacks reasonably; if they degrade in practice we add explicit `cause` plumbing. Decision deferred to first time it bites.
- **Per-feature "graceful disable"** — if audio fails to init, the emulator should keep running with sound off. Policy is "yes, degrade by feature", but the exact list (audio, video pixel format, snapshot, save state) gets enumerated as those features formalise.
- **Telemetry / crash reporting** — none in v1. If we add it later, the typed hierarchy makes it cheap (filter by `WorkbenchError` discriminant). Tracked in `wiki/agents/deferred.md`.

## Links

- Foundation epic: `b1236bb`
- This issue: `68d8283`
- ADR-0001 — Plugin-based retro-development workbench
- ADR-0002 — Layering rules (defines layer-by-layer error styles)
- ADR-0003 — Plugin host model (defines `plugin:crashed` events at the host boundary)
- Issue `714938a` — React error boundary around PluginEditor mount (becomes the Level-3 mount boundary)
- Foundation `Logger` issue — diagnostics surface this ADR uses
