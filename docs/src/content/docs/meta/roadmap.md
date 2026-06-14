---
title: Roadmap
description: The roadmap lives in Radicle issues, not in a markdown file.
sidebar:
  order: 4
---

There is no hand-maintained roadmap document — it would go stale the moment it was written. The roadmap **is** the set of [Radicle issues](/docs/meta/project/), grouped by milestone.

## Read the current roadmap

With the `rad` CLI and the repo cloned:

```sh
rad issue list --all                       # every issue
rad issue list --label milestone:v0.8.0    # issues for a given milestone
rad issue list --label epic                # the big-ticket epics
```

Each issue carries labels that make the plan legible:

- `milestone:*` — which release an item is slated for.
- `epic` and `parent:<id>` — epics and the child issues that roll up to them.
- `state:*` — where an item sits (e.g. in progress vs. backlog).
- `priority:*` — relative ordering within a milestone.

## How milestones work

Work is organised into milestones (release-shaped buckets like `v0.8.0`). Within a milestone, epics group related child issues. Rather than restate any of that here — where it would drift out of date — query Radicle directly for the live picture.

For how to find and read issues, see [The project](/docs/meta/project/). To get involved, see [Contributing](/docs/meta/contributing/).
