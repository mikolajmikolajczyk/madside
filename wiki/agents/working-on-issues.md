# Working on issues

How madside tracks work on its canonical forge, **GitHub**
([`github.com/mikolajmikolajczyk/madside`](https://github.com/mikolajmikolajczyk/madside),
default branch `main`). Issues and pull requests both live there; drive them with
the `gh` CLI. This page covers the project-specific issue/label/PR conventions on
top of the generic flow in the repo-root [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## State labels we use

Madside uses **two** state labels on issues. The default (no state label) is the
backlog. No `state:triage`, no `state:review` (solo project, no review step).

| Label | Meaning |
|-------|---------|
| `state:in-progress` | Actively being worked. Apply **before** you start writing code. |
| `state:blocked` | Waiting on something external (decision, upstream, hardware). Pair with a `blocked:*` label that names the blocker. |
| (no state label) | Filed, scoped, not started — the default backlog for every new issue. |

Conventions:

- **Exactly one `state:*` label at a time.** Picking up: `gh issue edit <n> --add-label state:in-progress`. Blocking: `gh issue edit <n> --remove-label state:in-progress --add-label state:blocked`. Finishing: just close the issue (`gh issue close <n>`, or let the merged PR close it via a `Closes #<n>` line) — no need to strip `state:*`.
- **Don't introduce `state:review`** unless a second contributor joins. Solo work doesn't need it; pretending it does just makes the board lie.
- **`state:blocked` requires a paired `blocked:*` label** (issue number or free-text). A naked `state:blocked` is invisible — nobody knows what's blocking.

Other labels that keep the board legible: `priority:*`, `milestone:*`, `epic`, and
`parent:#<n>` links for child issues that roll up to an epic.

## Branch naming — Conventional Branch

We use [conventionalbranch.org](https://conventionalbranch.org/) for any branch that isn't `main`.

```
<type>/<short-slug>
```

Types: `feat`, `bugfix`, `hotfix`, `chore`, `docs`, `test`, `release`.

Optional issue prefix: append the issue number if it helps you find the branch later.

```
feat/multi-format-loader
feat/142-multi-format-loader     # with issue hint
chore/eslint-boundaries
docs/adr-0002-layering
```

Why a convention at all on a solo project: future-me, AI agents, and
`git branch --list 'feat/*'` queries all want predictability.

Conventional Branch is **not** Conventional Commits — commit messages still follow
Conventional Commits separately (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `release:`).

## PR description template

Not a hard requirement, but matches what the project expects. The repo ships a PR
template; fill it in. The shape:

```markdown
## Why

<one paragraph: motivation; link the issue with `Closes #<n>`>

## What

<bulleted summary of the changes>

## Acceptance

- [ ] criterion 1 from the issue
- [ ] criterion 2
- [ ] criterion 3

## Notes

<anything reviewers / future-you should know>
```

`Closes #<n>` in the body auto-closes the issue when the PR merges. Checked boxes
let future-you see at a glance what landed vs what slipped.

## Issue → PR → merged (madside flow)

```sh
# 1. Start
gh issue edit <n> --add-label state:in-progress

# 2. Branch off main
git checkout main && git pull
git checkout -b feat/<n>-<slug>

# 3. Work + commit (Conventional Commits, GPG-signed appreciated, no Claude co-author)
git commit -m "feat: <subject>"

# 4. Open the PR to main (CI must pass)
git push -u origin HEAD
gh pr create --base main --fill   # then fill in the template, add `Closes #<n>`

# 5. Merge once CI is green; the `Closes #<n>` line closes the issue
```

**CI is the gate** (typecheck · test · lint · build + docs build). Don't merge red.

## Decision capture inside an issue

For decisions tied to one issue (e.g. "I'm using `mitt` over `nanoevents` for this
EventBus implementation"), **comment on the issue**, don't open an ADR.

```sh
gh issue comment <n> -b "Decided: mitt over nanoevents — 200 B vs 150 B, but mitt has typed events out of the box and we don't need RxJS-style streams. Revisit if subscription complexity grows."
```

For cross-cutting decisions that don't belong to a single issue, write to
`wiki/decisions/`. For app-shape decisions (constraining plugin contracts), write an
ADR. See [`../adr/README.md`](../adr/README.md) for the three-way split.

## Session handoff

When ending a coding session mid-issue, leave a comment on the active GitHub issue:

```sh
gh issue comment <n> -b "Session pause $(date -I). Done: <X>. Next: <Y>. Blocker: <Z|none>."
```

The next session (you or an agent) reads recent comments via
`gh issue view <n> --comments` and picks up without rediscovering state from the diff.

This complements the auto-memory file at
`~/.claude/projects/-home-mikolaj-src-madside/memory/` (Claude Code only) — the issue
comment is forge-visible and agent-agnostic.
