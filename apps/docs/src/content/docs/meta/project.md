---
title: The project
description: madside is developed on GitHub — the canonical home for source, issues, and pull requests.
sidebar:
  order: 3
---

madside is an in-browser IDE for retro hardware — Atari 8-bit today, NES alongside it, and a plugin model that aims at any retro or fantasy machine.

## Where the code lives

madside lives on **[GitHub](https://github.com/mikolajmikolajczyk/madside)**, the canonical home for the source, issues, and pull requests. The default branch is `main`.

(The project was developed on [Radicle](https://radicle.xyz) in its early days; the canonical forge has since moved to GitHub.)

## Finding issues and project status

Everything tracked — bugs, features, milestones, the roadmap — lives as **GitHub issues**. With the [`gh` CLI](https://cli.github.com) installed, or just in the browser:

```sh
gh issue list --state all     # everything
gh issue list                 # open issues
gh issue view <n> --comments  # one issue, with comments
```

Or browse them at [github.com/mikolajmikolajczyk/madside/issues](https://github.com/mikolajmikolajczyk/madside/issues).

Issues follow a label convention (`state:*`, `priority:*`, `milestone:*`, plus `epic` / `parent:#<n>` links) so they form a kanban-style board.

## Getting the repo

```sh
git clone https://github.com/mikolajmikolajczyk/madside
```

See also: the [Roadmap](/docs/meta/roadmap/) and [Contributing](/docs/meta/contributing/) pages.
