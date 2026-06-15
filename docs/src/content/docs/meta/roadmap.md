---
title: Roadmap
description: The roadmap lives in GitHub issues, not in a markdown file.
sidebar:
  order: 4
---

There is no hand-maintained roadmap document — it would go stale the moment it was written. The roadmap **is** the set of [GitHub issues](https://github.com/mikolajmikolajczyk/madside/issues), grouped by milestone.

## Read the current roadmap

In the browser, see [github.com/mikolajmikolajczyk/madside/issues](https://github.com/mikolajmikolajczyk/madside/issues). Or with the [`gh` CLI](https://cli.github.com):

```sh
gh issue list --state all                  # every issue
gh issue list --label milestone:v0.8.0     # issues for a given milestone
gh issue list --label epic                 # the big-ticket epics
```

Each issue carries labels that make the plan legible:

- `milestone:*` — which release an item is slated for.
- `epic` and `parent:#<n>` — epics and the child issues that roll up to them.
- `state:*` — where an item sits (e.g. in progress vs. backlog).
- `priority:*` — relative ordering within a milestone.

## How milestones work

Work is organised into milestones (release-shaped buckets like `v0.8.0`). Within a milestone, epics group related child issues. Rather than restate any of that here — where it would drift out of date — query GitHub directly for the live picture.

For how to find and read issues, see [The project](/docs/meta/project/). To get involved, see [Contributing](/docs/meta/contributing/).
