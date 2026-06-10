# madside wiki

In-browser Web IDE pivoting from Atari-only to a plugin-based retro-development workbench. See [ADR-0001](adr/0001-plugin-based-workbench.md).

## Audience split

| Tree | Audience | What |
|------|----------|------|
| [`agents/`](agents/) | AI coding agents (Claude, Cursor, Aider, …) | Repo shape, conventions, gotchas, on-demand fragments. The root `AGENTS.md` and `CLAUDE.md` point here. |
| [`user/`](user/) | End users | Phase 13 manual source. Astro Starlight publishes this to `/docs/` on the site. |
| [`adr/`](adr/) | Both | Architecture Decision Records. Append-only, numbered. |
| [`architecture/`](architecture/) | Both | Diagrams, dependency graphs, layer overview. To land in Foundation. |
| [`plugin-api/`](plugin-api/) | Both | Plugin author contracts (Machine, Toolchain, Emulator, DebugAdapter, Panel, Converter, Editor). To land in M7. |
| [`testing/`](testing/) | Both | Testing strategy + contract-test harness usage. To land in Foundation. |
| [`skills/`](skills/) | AI agents | Local copies of `radicle` + `radboard` skills used by this project. |

## When to write an ADR

See [`adr/README.md`](adr/README.md) for the bar. ADRs are for decisions that constrain the app or plugin contracts; tooling / DX choices live in [`agents/dev-setup.md`](agents/dev-setup.md) instead.

## ADR index

- [ADR-0001 — Plugin-based retro-development workbench](adr/0001-plugin-based-workbench.md)
- [ADR-0002 — Layering rules + dependency direction](adr/0002-layering.md)
- [ADR-0003 — Plugin host model: main thread vs Web Worker](adr/0003-plugin-host-model.md)
- ADR-0004 — Error boundary + degradation strategy *(Foundation, planned)*
- ADR-0005 — Testing strategy: contract + headless integration hybrid *(Foundation, planned)*

## Conventions

- **All project documentation lives under `wiki/`.** There is no `docs/` folder.
- **`AGENTS.md` and `CLAUDE.md` at repo root are thin pointers** — body lives in `wiki/agents/`.
- **ADRs are append-only.** Once Accepted, write a new ADR to supersede; don't edit substance.
- **Internal links use repo-relative paths** (`adr/0002-layering.md`), not absolute URLs.
- **Issues and milestones live in Radicle**, not in markdown roadmaps. Run `rad issue list --all`.
