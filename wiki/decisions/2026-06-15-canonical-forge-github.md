# Canonical forge moved from Radicle to GitHub

**Date:** 2026-06-15
**Decider:** Mikołaj
**Tags:** process | forge

## Context

madside was developed on [Radicle](https://radicle.xyz) through the solo phase —
issues, the roadmap, and patches all lived there (with GitHub envisioned only as
a CI mirror that never actually materialised). Going public for contribution
means meeting people where they are: most potential contributors have a GitHub
account and know its issue/PR flow, not Radicle's.

## Decision

**GitHub is the canonical forge** (`github.com/mikolajmikolajczyk/madside`,
public, default branch `main`). Issues, the roadmap, and pull requests live on
GitHub. Radicle is retired as the forge.

- **No issue migration.** The remaining Radicle issues are finished there; new
  work is filed on GitHub. (Bulk-copying a half-finished board would be messy.)
- The forge switch itself is **infra/process, not an app feature** — no version
  bump. Tracked under epic `9c9c2f6` (no milestone).
- CI is GitHub Actions (`.github/workflows/ci.yml`); the contribution flow is in
  `CONTRIBUTING.md`; the issue/label workflow in `wiki/agents/working-on-issues.md`.
- The vendored Radicle/Radboard skills (`wiki/skills/`, `.claude/skills/`) were
  removed — the `gh` CLI + GitHub issues/PRs replace them. Radboard's label
  conventions map to GitHub labels.

## Alternatives considered

- **Stay on Radicle** — lost: tiny contributor pool; the friction of a new tool
  outweighs its decentralisation benefits at this stage.
- **Dual forge (Radicle canonical + GitHub mirror)** — lost: two sources of
  truth confuse contributors and double the maintenance; the mirror never even
  got built.
- **Migrate all Radicle issues to GitHub** — lost: a half-migrated board is
  worse than a clean start; finish the rad issues, then go GitHub-only.

## Trigger to revisit

A strong reason to decentralise (e.g. GitHub policy/availability concerns, or a
contributor base that prefers Radicle). The Radicle node can be re-seeded and
the workflow docs restored from git history if needed.
