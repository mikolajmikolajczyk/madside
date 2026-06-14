---
title: The project
description: madside is developed on Radicle, with GitHub as a CI-only mirror.
sidebar:
  order: 3
---

madside is an in-browser IDE for retro hardware — Atari 8-bit today, NES alongside it, and a plugin model that aims at any retro or fantasy machine.

## Where the code lives

madside is developed on **[Radicle](https://radicle.xyz)**, a peer-to-peer, sovereign code forge. Radicle is the **canonical home** for the source, issues, and patches (Radicle's equivalent of pull requests).

**GitHub is a CI-only mirror.** It exists to run continuous integration and to give the project a familiar public mirror — but issues, the roadmap, and code review happen on Radicle, not GitHub. Don't expect GitHub issues or PRs to be the source of truth.

## Finding issues and project status

Everything tracked — bugs, features, milestones, the roadmap — lives as **Radicle issues**. With the `rad` CLI installed and the repo cloned:

```sh
rad issue list --all          # everything
rad issue list                # open issues
rad issue show <id>           # one issue, with comments
```

Issues follow a label convention (`state:*`, `priority:*`, `milestone:*`, plus `epic` / `parent:<id>` links) so they form a kanban-style board.

## Getting the repo via Radicle

Radicle repos are addressed by a Repository ID (RID), not a URL. Once you have the project's RID:

```sh
rad clone <rid>
```

If you only want to browse, the GitHub mirror is a read-only convenience copy.

See also: the [Roadmap](/docs/meta/roadmap/) and [Contributing](/docs/meta/contributing/) pages.
