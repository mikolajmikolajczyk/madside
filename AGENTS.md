# AGENTS.md — madside

Repo-specific notes for coding agents (Claude Code, Cursor, Aider, Copilot, …). Generic software-engineering advice is out of scope.

> **CLAUDE.md** at repo root is `@AGENTS.md` plus Claude-only overrides. Other agents read this file directly.

## What this is

In-browser Web IDE for retro hardware. Currently Atari 8-bit (MADS + Altirra wasm), pivoting to plugin-based workbench supporting any retro machine (Atari/NES/C64/fantasy). See [`wiki/adr/0001-plugin-based-workbench.md`](wiki/adr/0001-plugin-based-workbench.md).

## Where things live

| Need | Path |
|------|------|
| **Source of truth for roadmap, milestones, backlog** | Radicle issues — `rad issue list --all`. **Don't read roadmaps from markdown.** |
| Current repo shape, data flow, file map | [`wiki/agents/architecture.md`](wiki/agents/architecture.md) |
| Coding conventions, TypeScript rules, file naming | [`wiki/agents/conventions.md`](wiki/agents/conventions.md) |
| Feature status (what works, what's in flight) | [`wiki/agents/status.md`](wiki/agents/status.md) |
| Common dev commands (build, dev, typecheck) | [`wiki/agents/commands.md`](wiki/agents/commands.md) |
| Tooling (Nix flake, direnv, pre-commit, static analysis) | [`wiki/agents/dev-setup.md`](wiki/agents/dev-setup.md) |
| Working on issues (state columns, branch naming, patch flow, session handoff) | [`wiki/agents/working-on-issues.md`](wiki/agents/working-on-issues.md) |
| Where to capture decisions (ADR vs decision log vs comment) | [`wiki/adr/README.md`](wiki/adr/README.md) |
| Atari + plugin terminology | [`wiki/agents/glossary.md`](wiki/agents/glossary.md) |
| How `mads.wasm` was built / how to rebuild | [`wiki/agents/mads-wasm-build.md`](wiki/agents/mads-wasm-build.md) |
| How `altirra-core.wasm` was built / how to rebuild | [`wiki/agents/altirra-wasm-build.md`](wiki/agents/altirra-wasm-build.md) |
| Things deliberately deferred — do NOT implement unprompted | [`wiki/agents/deferred.md`](wiki/agents/deferred.md) |
| Plugin contracts (Machine/Toolchain/Emulator/Debug/Panel/Converter/Editor) | [`wiki/plugin-api/`](wiki/plugin-api/) |
| Architecture Decision Records | [`wiki/adr/`](wiki/adr/) |
| Testing strategy | [`wiki/testing/`](wiki/testing/) |
| **Public** docs site (user + plugin-author, published to `/docs/`) | [`docs/src/content/docs/`](docs/src/content/docs/) (Astro Starlight) |
| Radicle skill (issue/patch CLI) | [`wiki/skills/radicle.md`](wiki/skills/radicle.md) |
| Radboard skill (label conventions for kanban) | [`wiki/skills/radboard.md`](wiki/skills/radboard.md) |

## Load-on-demand rule

Don't read every wiki file at session start. Pick the file matching the task — they are sized to be loaded individually.

## Session handoff

When ending a session mid-issue, drop a one-line comment on the active issue describing what's done, what's next, and any blocker:

```sh
rad issue comment <hex7> -m "Session pause $(date -I). Done: <X>. Next: <Y>. Blocker: <Z|none>."
```

When starting a session, read recent comments on the most-recently-touched in-progress issue (`rad issue list --label state:in-progress`, then `rad issue show <hex7>`) before doing anything else. Forge-visible, agent-agnostic.

For Claude Code specifically, the same handoff doubles into auto-memory at `~/.claude/projects/-home-mikolaj-src-madside/memory/`. Use whichever fits, but issue comments are the canonical surface.

Details: [`wiki/agents/working-on-issues.md`](wiki/agents/working-on-issues.md).

## Working on issues / patches

This repo uses **Radicle** as its canonical forge (GitHub is a CI-only mirror). Read [`wiki/skills/radicle.md`](wiki/skills/radicle.md) before driving `rad`. Issues follow [`wiki/skills/radboard.md`](wiki/skills/radboard.md) label conventions (`state:*`, `priority:*`, `milestone:*`, `epic`, `parent:<hex7>`, `blocked:*`).

## Quick dev loop

```sh
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npx tsc --noEmit     # typecheck
```

Full command list: [`wiki/agents/commands.md`](wiki/agents/commands.md).

## Hard rules (don't violate)

- **Never commit without explicit user request.** Even mid-task, after accepting a plan, stop and ask. Acceptance of plan ≠ acceptance of commit.
- **Don't add features, refactor, or introduce abstractions beyond what the task requires.** Bug fix = bug fix, not surrounding cleanup.
- **Don't pre-empt later milestones.** If something is tagged `milestone:m5`, don't half-implement it during M2 work.
- **Two doc trees, don't mix them.** `wiki/` = internal, agent-/maintainer-facing notes (architecture, ADRs, conventions, status). `docs/` = the **public** Astro Starlight site (user + plugin-author docs) published to `/docs/`. Both are intentional — do NOT move `docs/` into `wiki/` or delete it. Internal note → `wiki/`; public-facing page → `docs/src/content/docs/`.

## Code ownership

Solo project. Sole maintainer and ADR decider: **Mikołaj**.
