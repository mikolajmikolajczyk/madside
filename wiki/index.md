# madside wiki

In-browser Web IDE pivoting from Atari-only to a plugin-based retro-development workbench. See [ADR-0001](adr/0001-plugin-based-workbench.md).

## Audience split

| Tree | Audience | What |
|------|----------|------|
| [`agents/`](agents/) | AI coding agents (Claude, Cursor, Aider, …) | Repo shape, conventions, gotchas, on-demand fragments. The root `AGENTS.md` and `CLAUDE.md` point here. |
| [`docs/`](../docs/) (repo root) | End users | Public user docs moved here — Astro Starlight workspace (`docs/src/content/docs/`), published to `/docs/` on the site. There is no `wiki/user/`. |
| [`adr/`](adr/) | Both | Architecture Decision Records. Append-only, numbered. |
| [`architecture/`](architecture/) | Both | Diagrams, dependency graphs, layer overview. See `architecture/README.md`. |
| [`plugin-api/`](plugin-api/) | Both | Plugin author contracts (Machine, Toolchain, DebugAdapter, Panel, Converter, Editor). One md per kind + hello-world. EmulatorPlugin lands with M4 follow-up. |
| [`testing/`](testing/) | Both | Testing strategy + contract-test harness usage. See `testing/e2e-guardrails.md`. |
| [`skills/`](skills/) | AI agents | Vendored skills for this project. Currently none — see `skills/index.md`. |

## When to write an ADR

See [`adr/README.md`](adr/README.md) for the bar. ADRs are for decisions that constrain the app or plugin contracts; tooling / DX choices live in [`agents/dev-setup.md`](agents/dev-setup.md) instead.

## ADR index

- [ADR-0001 — Plugin-based retro-development workbench](adr/0001-plugin-based-workbench.md)
- [ADR-0002 — Layering rules + dependency direction](adr/0002-layering.md)
- [ADR-0003 — Plugin host model: main thread vs Web Worker](adr/0003-plugin-host-model.md)
- [ADR-0004 — Error boundary + degradation strategy](adr/0004-error-boundaries.md)
- [ADR-0005 — Testing strategy: contract + headless integration hybrid](adr/0005-testing-strategy.md)
- [ADR-0006 — License: AGPL-3.0-or-later](adr/0006-license-agpl.md)
- [ADR-0007 — Service ↔ UI sync via state machines + events](adr/0007-service-ui-sync.md)

## Conventions

- **Agent + architecture docs live under `wiki/`.** Public end-user docs live in the repo-root `docs/` Astro Starlight workspace, published to `/docs/`.
- **`AGENTS.md` and `CLAUDE.md` at repo root are thin pointers** — body lives in `wiki/agents/`.
- **ADRs are append-only.** Once Accepted, write a new ADR to supersede; don't edit substance.
- **Internal links use repo-relative paths** (`adr/0002-layering.md`), not absolute URLs.
- **Issues and milestones live in GitHub**, not in markdown roadmaps. Run `gh issue list` (repo `mikolajmikolajczyk/madside`).
