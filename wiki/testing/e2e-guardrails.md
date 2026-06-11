# E2E-ready guardrails

> Playwright is deferred until after M3-services. These conventions keep the app paintable so adding E2E later costs nothing extra. Referenced from [ADR-0005](../adr/0005-testing-strategy.md).

## Selectors — `data-testid`

Every user-action surface gets a stable `data-testid`. Apply as features land; never bolt on at E2E time.

| Surface | Pattern |
|---------|---------|
| Top menu triggers | `menu.<file|edit|run|help>` |
| Menu items | `menu.<menu>.<action>` (e.g. `menu.file.new`, `menu.run.step`) |
| Switch-project sub-items | `menu.file.switch-project.<projectId>` |
| Debug bar buttons | `dbg.<action>` (e.g. `dbg.run`, `dbg.step`, `dbg.bp-toggle`) |
| Menubar shell + title | `menubar`, `menubar.title` |
| Debug bar shell | `debugbar` |
| File tree rows | `filetree.row.<path>` |
| Dialog confirm / cancel | `dialog.<dialog-id>.<confirm|cancel>` *(land when dialogs need it)* |

Rules:

- Use dot-paths. They're greppable, and the prefix tells you which surface a test is poking at.
- Never use `data-testid` for styling or logic — it's a runtime no-op.
- A `data-testid` may change only when the user-facing meaning changes. Adding new ones is fine.

## Determinism

- **No `Math.random` in render code paths.** Use stable hashes or props. Audited: zero hits in `src/ui` as of `7659319`.
- **`Date.now` in render is OK only for display** ("X seconds ago", relative timestamps). Test fixtures can mock `Date.now` once the timer-injection seam lands.
- **Debounces + timers are injectable** (planned with M3-services). Default to real wall-clock; tests pass a fake.

## URL-loadable state

The app accepts `?project=<projectId>` to boot directly into a known project. Implementation: `ensureActiveProject(preferredId)` in `@adapters/storage-idb`. The URL param wins when it resolves; otherwise the persisted active id is used; otherwise the seed project boots.

Use cases:

- E2E tests construct a known project via the contract test fixtures, persist it, then load `?project=<id>`.
- Shared deep links (post Phase 13 docs) point readers at a specific example.

## AudioContext + wasm bootstrap

Behind ports / factory functions, so a Playwright runner can either stub them or wait for known ready signals.

- `RunService` (M3) gates audio start on a user gesture and emits `run:state` events for status transitions.
- Wasm module loaders return `Promise<void>` for ready; tests await it directly.

## Seed project determinism

Same file hashes on every fresh install — the seed contents in `@adapters/storage-idb/seed.ts` are static. Contract tests can hash the seed and assert it.

## Adding the next surface

When you introduce a new button, file row, modal, or panel:

1. Pick a `data-testid` from one of the patterns above (or add a new pattern + document it here).
2. Avoid `Math.random` / inline `Date.now` in the render path; if you need entropy, take it as a prop.
3. If the surface accepts a query-string-style argument from the URL, document the param + its precedence here.
