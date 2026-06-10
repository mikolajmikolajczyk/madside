# Decision log

Mid-weight decisions that don't qualify as ADRs but are too durable for a single commit message or PR description. Append-only, lightweight, grep-friendly.

## When to write here vs ADR vs commit / issue comment

| Where | When |
|-------|------|
| **ADR** (`../adr/`) | Constrains app shape or plugin contracts. Hard to reverse. Affects future contributors. Examples: layering rules, plugin host model, error boundary strategy, schema v2, machine plugin interface. |
| **Decision log** (this folder) | Cross-cutting tool / library / process choice not tied to one issue. Reversible in days, not months. Examples: "we use mitt over nanoevents for EventBus", "wasm artifacts checked in not built per-CI", "AI agents in this repo write commit messages but never push". |
| **Issue comment** | Decision tied to a specific issue. Examples: "in `c5aaf5a` we map F-keys via POKEY KBCODE high range, not via console keys". Found via `rad issue show <hex7>`. |
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

(none yet — first entry lands when we make a non-ADR decision after Foundation begins)
