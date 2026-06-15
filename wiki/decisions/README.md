# Decision log

Mid-weight decisions that don't qualify as ADRs but are too durable for a single commit message or PR description. Append-only, lightweight, grep-friendly.

## When to write here vs ADR vs commit / issue comment

| Where | When |
|-------|------|
| **ADR** (`../adr/`) | Constrains app shape or plugin contracts. Hard to reverse. Affects future contributors. Examples: layering rules, plugin host model, error boundary strategy, schema v2, machine plugin interface. |
| **Decision log** (this folder) | Cross-cutting tool / library / process choice not tied to one issue. Reversible in days, not months. Examples: "we use mitt over nanoevents for EventBus", "wasm artifacts checked in not built per-CI", "AI agents in this repo write commit messages but never push". |
| **Issue comment** | Decision tied to a specific issue. Examples: "in #41 we map F-keys via POKEY KBCODE high range, not via console keys". Found via `gh issue view <n> --comments`. |
| **Commit message body** | Decision tied to a specific commit. Examples: "switched from sha256 to sha1 for blob hashing — IDB key length, no collision risk at our scale". |

See [`../adr/README.md`](../adr/README.md) for the ADR bar in detail.

## Format

One markdown file per decision. Name: `YYYY-MM-DD-short-slug.md`. Keep each entry under ~50 lines — long entries probably want to be ADRs.

Template:

```markdown
# <One-line decision summary>

**Date:** 2026-MM-DD
**Decider:** Mikołaj
**Tags:** library-choice | process | tooling | ...

## Context

What prompted the decision. One paragraph.

## Decision

What we picked. One paragraph.

## Alternatives considered

- **Option A** — short reason it lost
- **Option B** — short reason it lost

## Trigger to revisit

What would make us re-open this decision.
```

## Index

- [2026-06-12 — Debugger shortcuts moved off browser-reload bindings](2026-06-12-debugger-shortcuts-off-browser-reload.md)
- [2026-06-12 — M8 monorepo split cancelled](2026-06-12-monorepo-split-cancelled.md)
- [2026-06-13 — NES uses MADS (not ca65); machines declare named memory spaces](2026-06-13-nes-uses-mads-and-named-memory-spaces.md)
- [2026-06-14 — Interactive courses: bundled content, persistent lesson projects, declarative checks](2026-06-14-courses-architecture.md)
- [2026-06-14 — Remote courses are data, not code — trust model](2026-06-14-remote-courses-trust-model.md)
- [2026-06-15 — Canonical forge moved from Radicle to GitHub](2026-06-15-canonical-forge-github.md)
