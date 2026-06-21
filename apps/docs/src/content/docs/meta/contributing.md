---
title: Contributing
description: How to get the source, set up a dev environment, and propose changes.
sidebar:
  order: 6
---

madside is open source under [AGPL-3.0-or-later](/docs/meta/license/) and developed on [GitHub](/docs/meta/project/). Contributions are welcome. The repo's [`CONTRIBUTING.md`](https://github.com/mikolajmikolajczyk/madside/blob/main/CONTRIBUTING.md) is the canonical, detailed version of this page.

## Start here

1. **Read the agent/developer guide.** The repository root has `AGENTS.md` (the canonical developer notes, read by every coding agent) and `CLAUDE.md` (a thin Claude-specific entry point that includes it). Together with the `wiki/` directory, they cover architecture, conventions, the dev setup, and how issues and patches work. That's the deep dive — this page is just the pointer.

2. **Get the code.** `git clone https://github.com/mikolajmikolajczyk/madside`. See [The project](/docs/meta/project/).

3. **Quick dev loop.**

   ```sh
   npm run dev          # Vite dev server
   npm run build        # tsc -b && vite build
   npx tsc --noEmit     # typecheck
   ```

   The full command list lives in the repo's developer notes (`wiki/agents/commands.md`).

## Proposing a change

This project uses **GitHub pull requests** as the review surface: branch off (or fork) `main`, open a PR to `main`, and CI must pass before it merges. Commits follow [Conventional Commits](https://www.conventionalcommits.org). Work is tracked through [GitHub issues](/docs/meta/roadmap/), and a PR links back to the issue it addresses with `Closes #<n>`. Browse open issues to find something to pick up, or open a new issue to discuss a change before writing it. The full step-by-step lives in the repo's [`CONTRIBUTING.md`](https://github.com/mikolajmikolajczyk/madside/blob/main/CONTRIBUTING.md).

If you're building a **plugin** rather than changing the core, you may not need to touch this repo at all — see [Extending madside](/docs/extending/).

## License of contributions

By contributing, you agree your changes are licensed under AGPL-3.0-or-later (inbound = outbound). There is no CLA today.
