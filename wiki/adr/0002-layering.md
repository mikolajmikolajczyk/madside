# ADR-0002: Layering rules + dependency direction

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** architecture, foundation, conventions

## Context

ADR-0001 commits madside to a plugin-based workbench. That goal only survives if the codebase has a clear shape — services don't import plugin modules directly, UI doesn't reach into adapters, plugins don't depend on the workbench shell. Prior to this ADR none of it was enforced: `App.tsx` and the debug components imported `EmuBackend` directly; `lib/mads.ts` (a toolchain) was imported from `App.tsx` (UI). The Phase 12 hook split cleaned up state ownership but did nothing about layer crossings.

Without a layering contract, the M3 services / M4 machine plugin refactor would perpetuate the same shape under new names. We need rules that ESLint can enforce, names that don't sound architecturally ambiguous, and a folder layout that mirrors them.

## Decision drivers

- **One source of truth.** The folder layout, ESLint config, TypeScript project references, and import-alias scheme must all describe the same layers. No drift.
- **Enforceable, not aspirational.** A layer rule that exists only in prose gets violated within a sprint. ESLint `boundaries` plugin must reject violations.
- **Plugin authors come last.** They depend on the smallest, most stable surface (`ports/` + `core/`). They never depend on a service, an adapter, or a UI component.
- **Reversibility.** Layer names sit on every import path; renaming them later is a global churn. Pick names that survive the M3–M9 evolution.
- **Solo-friendly.** No layer should require a separate package, separate tsconfig, or separate CI step to exist. The earlier-planned M8 monorepo split was cancelled 2026-06-12 (see [decisions](../decisions/2026-06-12-monorepo-split-cancelled.md)); layer boundaries are the lasting enforcement, not workspace boundaries.

## Considered options

1. **No formal layers** — rely on conventions and review. Status quo. Rejected: review doesn't scale on a solo project, and the convention has already drifted in 12 phases.
2. **Two-layer split (UI vs everything-else)** — match what Phase 12 hook split established. Rejected: too coarse. "Everything else" includes the toolchain, the emulator, the storage layer, and the plugin host. Those have different stability and dependency needs.
3. **Hexagonal / ports-and-adapters with seven layers (chosen).** Standard, well-documented pattern. Distinguishes ports (interfaces) from adapters (impls), services (orchestration) from plugins (extensions). Names familiar to anyone who has read Cockburn or Vernon.
4. **DDD-style bounded contexts** — name layers after business domains (`build`, `debug`, `assets`). Rejected: contexts overlap with plugin kinds, and the "business domain" of a retro IDE doesn't carve up that neatly.
5. **Feature-folder layout** — group by feature, not by layer. Rejected: doesn't match a plugin-host model where each plugin kind already cuts across features.

## Decision outcome

Adopt seven layers with a strict downward-only dependency rule. Each layer is a `src/<layer>/` folder, an import alias, and an ESLint `boundaries` zone.

### Layers (top to bottom)

| Layer | Path | Alias | Responsibility |
|-------|------|-------|----------------|
| **ui** | `src/ui/` | `@ui` | React components, react-bound hooks, the layout shell |
| **app** | `src/app/` | `@app` | Workbench factory, command glue, top-level orchestration |
| **services** | `src/services/` | `@services` | `BuildService`, `RunService`, `DebugService`, `AssetPipelineService`, `PluginRegistry`, `EventBus`, `CommandRegistry` |
| **ports** | `src/ports/` | `@ports` | Interfaces only: `ProjectRepository`, `Logger`, plugin contracts (`MachinePlugin`, `ToolchainPlugin`, …) |
| **adapters** | `src/adapters/` | `@adapters` | Port implementations: IDB storage, wasm bindings, web audio, browser APIs |
| **plugins** | `src/plugins/` | `@plugins` | Built-in plugin instances (converter-*, editor-*, later machine-*, toolchain-*, …) |
| **core** | `src/core/` | `@core` | Pure utilities (hash, hex, path, time). Zero deps on any other layer. No side effects. |

### Dependency rule (the contract)

A layer may only import from layers **below** it in the table. Crossings:

| From → | core | ports | adapters | services | plugins | app | ui |
|--------|------|-------|----------|----------|---------|-----|-----|
| **core** | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **ports** | ✓ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
| **adapters** | ✓ | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| **services** | ✓ | ✓ | ✗ | — | ✗ | ✗ | ✗ |
| **plugins** | ✓ | ✓ | ✗ | ✗ | — | ✗ | ✗ |
| **app** | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✗ |
| **ui** | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | — |

Two non-obvious rows:

- **services** cannot import from **adapters**. Services know ports only. The `app` layer wires concrete adapters into services via dependency injection.
- **ui** cannot import from **adapters** or **plugins**. UI talks to services via `app`-provided handles. UI may import `ports` for the *types* the services expose, never for the implementations.

### Why "app" sits above services but below ui

`app` is the dependency-injection seam. `createWorkbench(deps)` lives there; it knows about every concrete adapter (the IDB ProjectRepository, the AltirraBackend, the MadsToolchain) and wires them into services. `ui` consumes the constructed workbench but does not know how it was built. This keeps `services` itself port-only and testable headless.

### Why plugins cannot import services

If plugins could import services, they could call `buildService.build()` re-entrantly, depend on `RunService` lifecycle, etc. — a plugin becomes a privileged actor and the contract erodes. Plugins receive what they need via a context object delivered through the relevant port (`PanelContext`, `ConverterContext`, …). Whatever a plugin can do is exactly what its port specifies.

### Module barrels

Every layer folder exposes `index.ts` with explicit exports. Cross-folder imports go through the barrel — no `@services/build/internal/foo`. Within a single folder, relative imports are fine. The ESLint `boundaries` config (separate Foundation issue) enforces this.

### What about cross-cutting concerns

- **Logging** is a port (`@ports/Logger`). Adapters and services depend on the port; `app` wires a concrete adapter (console, buffered, noop). Plugins receive a logger via their context, never as a global.
- **Event bus** is a service. UI subscribes via the workbench handle. Plugins receive subscriptions via their context.
- **Configuration** is a port (`@ports/ProjectRepository`-adjacent or its own `@ports/Config`). Same pattern as logger.
- **Telemetry** — none today; if added, becomes another port.

There is no `lib/` or `utils/` folder. Pure helpers go in `@core`; anything stateful goes in the layer it belongs to.

### Aliases

`vite.config.ts` + `tsconfig.json` both declare `@core / @ports / @adapters / @services / @plugins / @app / @ui`. The ESLint resolver reads from the tsconfig. One source of truth lives in `tsconfig.json`.

## Positive consequences

- ESLint catches new violations at commit time. No prose-only rule rot.
- M3 services extracted into `@services`, importing only from `@ports` (commits `5889cce` Build / `ee46270` Run / `eac58f1` Debug / `a4a4865` AssetPipeline).
- M4 MachinePlugin landed in `@plugins/machine-atari-xl` (`a6c310d`), depending only on `@ports` + `@core`. M5 ToolchainPlugin landed in `@plugins/toolchain-mads` (`ea35144`) with its private wasm-mads adapter co-located inside the plugin folder. Plugin authors get the same surface.
- Testing strategy (ADR-0005) gets a clear target: `@ports` defines the contracts, `@core` is pure (easy to unit-test), `app`-level wiring is the integration boundary.
- TypeScript project references mirror the layer graph — incremental builds, faster type-checks. (The M8 monorepo split was cancelled — see decision log; layer boundaries plus `eslint-plugin-boundaries` deliver the architectural property without a workspace split.)

## Negative consequences

- Folder reorg is a big-bang patch (deliberate, per Foundation epic). Every import in `src/` moves. Branches in flight at the time will need rebase work.
- Seven layers is more than two. Cognitive overhead for very small changes. Mitigated by the rule that a one-folder change uses relative imports — only cross-folder reaches add the `@layer` prefix.
- `app` as the wiring seam is an extra concept beyond classical hexagonal vocabulary. Documented here and in `wiki/agents/architecture.md`.

## Open questions

- **Tests folder location** — decided later in ADR-0005. Likely `tests/` at repo root, mirroring the `src/` layer layout. Inline `.test.ts` files alongside source remain allowed for pure-logic units in `@core` and `@ports`.
- **Generated code** — none today. If added, lives in a `generated/` folder per layer (e.g. `src/ports/generated/`) and is excluded from lint.

## Links

- Foundation epic: `b1236bb`
- This issue: `10cf36f`
- Folder reorg issue: `572812b`
- ESLint boundaries issue: `01c77ab`
- Path aliases issue: `35577e6`
- TypeScript project references issue: `9ccb4fa`
- Module barrel discipline issue: `2af2cf8`
- ADR-0001 — Plugin-based retro-development workbench (parent decision)
