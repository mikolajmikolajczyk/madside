---
title: Contributing
description: How to get the source, set up a dev environment, and propose changes.
sidebar:
  order: 6
---

madside is open source under [AGPL-3.0-or-later](/docs/meta/license/) and developed on [Radicle](/docs/meta/project/). Contributions are welcome.

## Start here

1. **Read the agent/developer guide.** The repository root has `AGENTS.md` (the canonical developer notes, read by every coding agent) and `CLAUDE.md` (a thin Claude-specific entry point that includes it). Together with the `wiki/` directory, they cover architecture, conventions, the dev setup, and how issues and patches work. That's the deep dive — this page is just the pointer.

2. **Get the code.** Clone via Radicle (`rad clone <rid>`); the GitHub mirror is a read-only convenience copy. See [The project](/docs/meta/project/).

3. **Quick dev loop.**

   ```sh
   npm run dev          # Vite dev server
   npm run build        # tsc -b && vite build
   npx tsc --noEmit     # typecheck
   ```

   The full command list lives in the repo's developer notes (`wiki/agents/commands.md`).

## Proposing a change

This project uses **Radicle patches** (Radicle's equivalent of pull requests) as the review surface — not GitHub PRs (GitHub is a CI-only mirror). Work is tracked through [Radicle issues](/docs/meta/roadmap/), and patches link back to the issue they address. Browse open issues to find something to pick up, or open a new issue to discuss a change before writing it.

If you're building a **plugin** rather than changing the core, you may not need to touch this repo at all — see [Extending madside](/docs/extending/).

## License of contributions

By contributing, you agree your changes are licensed under AGPL-3.0-or-later (inbound = outbound). There is no CLA today.
