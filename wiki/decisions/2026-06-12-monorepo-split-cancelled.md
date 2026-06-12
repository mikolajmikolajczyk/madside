# 2026-06-12 — M8 monorepo split cancelled

**Decided by:** Mikołaj.
**Status:** Accepted.
**Replaces:** `wiki/agents/deferred.md` "deferred until external plugin authors exist" stance — now stronger: cancelled outright.
**Cancels:** Radicle epic `c2f4590` (M8 monorepo split).

## Context

ADR-0001 sketched a `packages/{core,plugin-api,workbench,plugins/*}` workspace layout for M8. The plan was to promote ADR-0002 folder boundaries to workspace boundaries once plugin contracts (M3–M7) stabilised — which they now have.

In parallel, M3 shipped `PluginRegistry` with a Blob URL + dynamic `import()` loader (`createPluginLoader`). Today it already runs project-local converters (`converters/*.js`) and Phase 11 editors (`editors/*.js`). The same path generalises trivially to remote-hosted plugins — fetch the source, sha256-key the cache, hand the Blob URL to dynamic import. Nothing about that needs a workspace split.

## Decision

Cancel M8 entirely. Built-in plugins stay under `src/plugins/` in the main repo. Future third-party plugins ship from their own repos (one per author / per plugin) and load through the existing Blob URL pipeline plus a small follow-up that lets `project.json` reference a remote URL or content address.

## Why

- **No external plugin authors today.** The whole split was contingent on "when external authors exist". Nobody is queued. Designing for hypothetical ergonomics now is exactly the kind of pre-emption AGENTS.md tells future-me not to do.
- **The Blob URL loader already covers the case.** External plugins don't need to live in our repo at all — they need a way to be fetched and run. `createPluginLoader` does step two; step one is a small follow-up issue, not an epic.
- **Workspace split has real cost.** Multiple `package.json`, multiple tsconfigs, build dependency graph, per-package versioning + publish flows, separate lockfiles or shared one with hoisting headaches, CI matrix. None of that pays back until there are external consumers.
- **ADR-0002 already enforces layering** via `eslint-plugin-boundaries`. That delivers the architectural property the split was supposed to deliver, at zero infrastructure cost.

## Consequences

### Positive

- v0.8.0 milestone freed up for shippable user-facing work (the Astro Starlight docs site, renumbered from v0.9.0).
- One less giant infra task on the runway.
- `mirror` and `hosting` issues (previously parented to the M8 epic for filing convenience) move under a new `Infra` epic (`70269cc`) that carries no milestone — infra moves on its own clock.
- Reduces the "M3–M9 then M8" awkward ordering noted in `architecture.md` (M8 was always going to be last; now it is none).

### Negative

- If a real external plugin ecosystem emerges, we may want the split after all. Cost: do it then, with the actual constraints in hand, rather than guessing now. Mechanical refactor with ESLint boundaries already enforcing the layout.
- ADR-0001 mentions M8 as part of the long arc; needs an addendum note.

## Follow-up issues

- **Remote plugin manifest support** (file when first external author appears): `project.json` `plugins` entry accepts URL / CID; `createPluginLoader` fetches + sha256-caches + Blob-imports. ~1 day of work.
- ADR-0001 addendum: M8 cancelled, point at this decision.
- `wiki/agents/deferred.md`: M8 entry switches from "deferred" to "cancelled, see decisions/".

## Renumbering

With v0.8.0 freed:

| Was | Is | Scope |
|-----|----|-------|
| v0.8.0 (M8 split) | — | cancelled |
| v0.9.0 (Astro Starlight, `1116ee3`) | v0.8.0 | docs site |
| v1.0.0 (M9 NES — `8cf0a3b` epic + 4 children) | v0.9.0 | second machine validation |
| (open) | v1.0.0 | first post-NES major release target — TBD |
