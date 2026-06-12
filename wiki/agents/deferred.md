# Deliberately deferred — do NOT implement unprompted

If the user hasn't explicitly asked, leave these alone. Many were considered and rejected for *now*; revisiting them needs a new decision, not a stealth implementation.

## Architecture / tooling

- **Lezer grammar for MADS** — `StreamLanguage` is enough; revisit if rich semantic features need it.
- **Redux / Zustand / state library** — `useState` + custom hooks until coordination genuinely fails. ADR-0001 confirms.
- **Monorepo split** — explicitly M8 (v0.8.0). M3–M7 now shipped, so M8 prerequisites are met — but the split itself stays deferred until external plugin authors actually exist.
- **TypeScript Language Service in browser** (full IntelliSense for converter authors) — Phase 6D, still deferred.

## Plugin / converter ecosystem

- **Plugin sandbox / permission model / worker isolation** — ADR-0003 *designs* worker model; impl deferred to dedicated milestone.
- **Plugin marketplace / discovery** — when external authors actually exist.
- **Python / Pyodide for asset converters** — confirmed out. JS-only.

## UX / product

- **Light mode** — not now.
- **User accounts / cloud sync** — Phase 14+ collab covers this.
- **MADS error → editor lint markers** — post-emulator, when error parsing settles.
- **Step-over** — needs PC + instruction-length lookup. Step-into via single step works fine for now.
- **Cycle-exact xex breakpoints / `.lab` symbol resolution UI** — `.lab` parsed (for autocomplete) but not surfaced in BP UI.

## Storage

- **localStorage persistence** — superseded by IDB.
- **Backend / cloud sync** — IDB + FSA only.

## Manifest

- **`project.json` v1 → v2 backwards-compat shim** — hard cut. No external users.

## Anti-patterns (never re-introduce)

- **React state mirroring service state.** Any `useState` that parallel-tracks a service's `status` / `running` / `loaded` flag. **Why:** `ce0dc6f` (stale registers after Step) and `da6299d` (pause + brokeOn payload) both came from a missed manual emit while the UI kept its own shadow copy. Read service state via the `useSync*` hook from [ADR-0007](../adr/0007-service-ui-sync.md). The contract test (`tests/contract/run-service-events.test.ts`) is the catcher.
- **UI components emitting `<domain>:*` events for transitions the service owns.** `Emulator.tsx` emitting `debug:step-done` was a regression patch; the canonical step path lives in `DebugService.step()` (1e38ae3).

## Conventions

When you encounter something on this list mid-task, mention it to the user and ask. Don't quietly add it.
