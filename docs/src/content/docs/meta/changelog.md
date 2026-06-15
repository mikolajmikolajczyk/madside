---
title: Changelog
description: Where to read what changed between releases of madside.
sidebar:
  order: 5
---

madside does not keep a separate `CHANGELOG` file. The history of changes lives in the version control history itself.

## Where to read what changed

- **Release tags.** Releases are cut as version tags (for example `v0.7.5`). Browsing the tags and the commits between them is the most precise record of what shipped when.
- **GitHub issues.** Each release maps to a `milestone:*` on the [project's issues](/docs/meta/project/). Reading the closed issues for a milestone tells you what that release set out to do:

  ```sh
  gh issue list --state all --label milestone:v0.8.0
  ```

- **Commit history.** Commits use a conventional, scoped style (e.g. `feat(v0.7.5): …`, `docs(wiki): …`) with the release version in the scope, so `git log` filtered by version reads as a per-release summary.

If a curated, human-readable changelog is added later, it will appear here. Until then, the tags and GitHub milestones are the authoritative record — this page intentionally does not list release notes that could fall out of sync with them.
