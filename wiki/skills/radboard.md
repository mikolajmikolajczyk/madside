---
name: radboard
description: >
  Radboard label conventions for Radicle issues and patches. Use when
  authoring issues/patches in a project tracked by radboard so the
  kanban board, priority ordering, milestones, blocker links, and
  patch↔issue linking light up automatically. Pairs with the radicle
  skill — radicle covers the rad CLI, radboard covers what to put in
  titles/labels/commit subjects.
triggers:
  - radboard
  - kanban
  - "state:"
  - "priority:"
  - "milestone:"
  - "blocked:"
  - issue label
  - patch label
min_trust: guest
user-invocable: false
allowed-tools: Bash
---

# Radboard Skill

Radboard is a Tauri desktop kanban over Radicle. It does not store data of
its own — every board state comes from Radicle issues, patches, and
labels. To make a project "radboard-ready" out of the box, follow the
label and title conventions below.

This skill assumes you can already drive `rad` (see the `radicle` skill).

> **CRITICAL — label flag syntax:** `--labels` and `-a` take one label per
> flag occurrence. Repeat the flag for multiple labels. **Comma-separated
> lists create one literal label containing the commas, not multiple
> labels.** Every example in this skill follows the repeat-the-flag form.
>
> ```bash
> # CORRECT
> rad issue label <ID> -a epic -a priority:high
>
> # WRONG — creates a single label literally named "epic,priority:high"
> rad issue label <ID> -a "epic,priority:high"
> ```

## TL;DR cheat sheet

| Convention | Effect in radboard |
|------------|--------------------|
| `state:<col>` label on open issue | Places card in dynamic kanban column `<col>` |
| `priority:critical\|high\|medium\|low` | Orders card inside Open column; colored badge |
| `milestone:<name>` (prefix configurable) | Groups issues in Milestones view, progress bar |
| `blocked:<hex7>` label | Renders a "blocked by #<hex7>" chip linking to that issue |
| `blocked:<free-text>` label | Renders a non-link blocker chip (e.g. `blocked:awaiting-design`) |
| `epic` label | Marks issue as a parent epic; card shows `epic N` badge (N = child count) |
| `parent:<hex7>` label | Marks issue as child of `<hex7>`; card shows `↑ #<hex7>` chip linking to parent |
| `good-first-issue` label | Card and issue row get a small 🌱 badge — friendly marker for newcomers |
| 👍 / 👎 reactions on the root comment | Drive the "Most wanted" toggle in the Open kanban column (sorted by net score) |
| 7-char hex prefix of issue ID in patch title | Patch appears as indicator on that issue's card |
| 7-char hex prefix in patch description | Same |
| 7-char hex prefix in **commit subject** | Same — use this for multi-issue patches |
| Issue `--solved` (not `--closed`) when finishing | Card moves to Closed column with "solved" status |

## Best practices — the end-to-end workflow

This is the canonical lifecycle for an issue once a board adopts radboard.
Projects can rename or skip columns, but the transitions below cover the
high-confidence path. Project-specific column names live in the project's
own docs (e.g. `wiki/agents/working-on-issues.md`).

### 1. Open an issue with priority + milestone (state optional)

```bash
rad issue open -t "Add CSV export" -d "..." \
  --labels priority:medium \
  --labels milestone:v0.1.0
```

- **Don't add a `state:*` label unless the project uses an explicit
  intake column.** The built-in **Open** column already shows every
  open issue with no `state:*` — "no state label" is the default
  backlog state, not invisibility. Solo / small projects skip
  `state:triage` entirely.
- Use one of the four canonical `priority:*` values — anything else is
  ignored for ordering.
- Add a milestone label if the work is already scoped.

If the project's workflow does include an intake column (e.g.
multi-contributor projects that want to distinguish "filed but not yet
sanity-checked" from "ready to pick up"), add `--labels state:triage`
or whatever they name it. Check the project's own
`working-on-issues.md` (or equivalent) before assuming.

### 2. Pick it up: move the card

Before writing code, label the transition. This is the only signal other
contributors (human or agent) have that you've started.

```bash
rad issue label <ID> -a state:in-progress
# if an intake column was set, strip it:
rad issue label <ID> -d state:triage
```

If the project doesn't define `state:in-progress`, ask before inventing
columns — column proliferation is the most common board-mess pattern.

### 3. Encode the issue ID(s) when you push a patch

Patch ↔ issue linking is **automatic** if you put the 7-char hex prefix
of the issue ID in one of three places: patch title, patch description,
or any commit subject. Pick the form that matches your patch:

**Single-issue patch** — put it in the title.

```
[abc1234] feat: add CSV export
```

**Multi-issue patch** — keep the title clean, put one hex7 per commit
subject. Radboard scans every commit subject in the patch.

```
Sprint cleanup batch                          ← patch title (no hex)
├─ fix: validate input bounds for 0d948aa
├─ feat: add csv export for 3ca544a
└─ docs: clarify retry semantics for e9f1c22
```

Once the patch lands, those three issues will all show patch indicators
on their cards.

### 4. Move the card to review

```bash
rad issue label <ID> -d state:in-progress
rad issue label <ID> -a state:review
```

Skip this step if the project doesn't use a review column (solo
projects often don't — `state:in-progress` straight to merge is fine).

### 5. Mark the issue solved when the patch merges

```bash
rad issue state --solved <ID>
```

> **Critical — use `--solved`, not `--closed`.** Solved means "the
> work was done and shipped". Closed means "abandoned / won't fix /
> obsolete". Radboard renders them with different badges. GitHub
> muscle memory will lead you astray here — every issue you `--closed`
> when you meant `--solved` looks like a wontfix on the board.

The card automatically moves to the Closed column regardless of any
lingering `state:*` label, so you don't need to strip it.

### 6. Track dependencies as you go

If you discover that issue A is blocked by issue B, add the label
**while you remember**, not later:

```bash
rad issue label <A> -a blocked:<first-7-of-B>
```

Same for parent/child relationships once you scope an epic:

```bash
rad issue label <epic> -a epic
rad issue label <child> -a parent:<first-7-of-epic>
```

The blocker graph and the children section in epic detail view both
populate from these labels — there is no separate "set parent" UI.

### 7. Use reactions, not comments, for "want this"

Vote with `:+1:` / `:-1:` on the root issue body, not on a comment.
Those reactions drive the 🔥 Most-Wanted toggle in the Open column.
Comment threads track discussion; reactions track demand.

```bash
rad issue react <ID> :+1:
```

### What this earns you

Following the seven steps above means:

- Kanban view is correct without manual board housekeeping
- Patch indicators light up on the right cards
- Milestone progress bars are honest
- Blockers + epics render in detail panels
- Closed column accurately distinguishes solved vs abandoned
- Most-Wanted toggle reflects real demand

If you skip steps, none of these break — they just go fuzzy. The
worst single skip is `--closed` instead of `--solved`, because the
distinction is irreversible-looking to a casual reader of the board.

## Label conventions (the contract)

Radboard parses four reserved label prefixes. Anything else is treated as
a plain label chip.

### `state:<column>` — kanban column for open issues

- Drives column membership in the kanban view.
- `Open` and `Closed` columns are always present and bracket dynamic
  columns. Don't add `state:open` or `state:closed` — useless.
- Typical values: `state:triage`, `state:in-progress`, `state:review`,
  `state:blocked`. Pick whatever workflow you want — the column appears
  automatically once any open issue has the label.
- Closed/solved issues ignore any lingering `state:*` label and sit in
  the Closed column regardless.
- Moving a card in the UI rewrites this label.

```bash
rad issue label <ID> -a state:in-progress
rad issue label <ID> -d state:triage           # remove old before adding new
```

When opening an issue you want to land in a specific column from day one:

```bash
rad issue open -t "Title" -d "Body" \
  --labels state:in-progress --labels priority:high
```

### `priority:critical|high|medium|low` — ordering + badge

- **Exactly these four values.** Anything else (`priority:p1`,
  `priority:urgent`) is ignored by the priority logic and rendered as a
  plain label.
- Orders cards inside the Open column (`critical` on top, `low` at the
  bottom).
- Drives a colored priority badge on the card.

```bash
rad issue label <ID> -a priority:critical
```

### `milestone:<name>` — milestone grouping (prefix configurable)

- Default prefix: `milestone:`. The user can change it per-board to e.g.
  `m:` or `release:` via `LocalConfig.milestonePrefix`. **Do not hardcode
  `milestone:` in tooling — read it from config if you have access; if
  not, ask before assuming.**
- Issues can have multiple milestone labels (e.g. shipped in
  both `v0.5.0` and a tracking milestone).
- Sort behavior:
  - Semver values (`v1.0.0`) sort ascending and are grouped under a
    "Released" / "Upcoming" split.
  - Numeric prefixes (`0-alpha`, `1-beta`) get stripped + title-cased
    for display, sort by the numeric prefix.
  - Everything else: alphabetical.
- A milestone with all issues solved/closed shows as 100% in the
  progress bar.

```bash
rad issue label <ID> -a milestone:v0.6.0
```

### `epic` + `parent:<hex7>` — epic ↔ child grouping

Two labels work together to model parent/child relationships:

- **`epic`** (plain label, no value) — marks an issue as a parent epic.
  The card shows a purple `epic N` pill where N is the count of loaded
  children pointing at it. Detail view gets a "Children" section above
  Comments listing every child as a clickable row.
- **`parent:<hex7>`** where `<hex7>` is the 7-char prefix of the parent
  epic's id — marks an issue as a child. The card shows a purple
  `↑ #<hex7>` chip that clicks through to the epic. Detail view gets a
  "Parent epic" section above Comments.

If `<hex7>` doesn't match a loaded issue (parent in another repo,
deleted, or typo), the chip renders **orange** instead of purple and
becomes non-clickable. Same fallback as `blocked:<hex7>`.

```bash
# Mark issue d694f0c as an epic:
rad issue label d694f0c -a epic

# Mark issues 512347 and 513539 as children of d694f0c:
rad issue label 5123471 -a parent:d694f0c
rad issue label 513539e -a parent:d694f0c
```

#### Finding an epic and its children

The epic itself is just an issue with the `epic` label. To list epics:

```bash
# All open epics in the current repo:
rad issue list | grep -E "^.*epic[, ]"
# Or in JSON form for scripting:
rad issue list --format json | jq '.[] | select(.labels | index("epic"))'
```

To find children of a specific epic, search for the `parent:<hex7>`
label (use the epic's first 7 hex chars):

```bash
EPIC=d694f0cabc...                              # full id
PREFIX=${EPIC:0:7}                              # first 7 chars
rad issue list --format json \
  | jq --arg p "parent:$PREFIX" '.[] | select(.labels | index($p))'
```

For UI users: open the epic in the issue detail view — the "Children"
section above Comments lists every child with status badges.

#### Conventions

- Children reference parents by **7-char hex prefix**, not the full id
  — consistent with `blocked:<hex7>` and patch↔issue linking.
- An issue can be **both** an epic and a child (the issue spec calls
  nested epics out of scope, but the data model doesn't prevent it —
  just don't expect nested rendering).
- Removing the `epic` label from a parent does **not** strip
  `parent:<hex7>` labels off the children. The children become
  orphans (orange chip). Either remove the children's labels too, or
  re-label something else as `epic` with the same prefix.
- An epic's children can live in **any column**. There's no
  cross-column nesting yet — children render at their own card
  position with the upward chip.

### `good-first-issue` — newcomer-friendly marker

Add the bare label `good-first-issue` to surface a small 🌱 leaf on
the kanban card and the issues-list row. The label itself is hidden
from the regular chip list so the badge stays the dominant visual
signal. (Radicle label names can't contain spaces — use the dashed
form, not `good first issue`.)

```bash
rad issue label <ID> -a good-first-issue
```

### Reactions and the "Most wanted" toggle

The Open kanban column has a `prio | 🔥` switcher in its header. The
🔥 mode flattens the column and sorts cards by **net reactions** —
👍 count on the issue's root comment minus 👎. Each card gets a
`+N` / `-N` / `0` badge.

To drive this signal from the CLI, react on the issue itself (not on
its comments):

```bash
rad issue react <ID> :+1:
rad issue react <ID> :-1:
```

Reactions are per-author; running the command again toggles your vote
off. Counts depend on which peers your local node has synced with —
two users on different parts of the network can see different
rankings, so radboard surfaces a small caveat in the toggle.

### `blocked:<value>` — blocker chips and graph

Two flavours, both rendered as red chips on the card:

- **`blocked:<hex7>`** where `<hex7>` is a 7-character hex prefix of
  another issue's ID. Becomes a clickable link to that issue. Radboard
  also builds the inverse map ("issue X blocks issues Y, Z") for the
  detail sidebar.
- **`blocked:<free-text>`** for external blockers
  (e.g. `blocked:awaiting-design`, `blocked:upstream`, `blocked:dead123`
  where the hex doesn't match a real issue). Rendered as a plain
  non-link blocker chip.

```bash
# Issue 89a5bb2 is blocked by issue 586feea:
rad issue label 89a5bb2 -a blocked:586feea

# Issue is blocked by an external constraint:
rad issue label 89a5bb2 -a blocked:awaiting-design
```

Use 7 chars — radboard matches against the first 7 hex chars of issue IDs.
A full 40-char hex won't link.

## Patch ↔ issue linking

Radboard links patches to issues by scanning for **7-char hex prefixes**
of issue IDs in three places:

1. Patch **title**
2. Patch **description**
3. Each commit's **subject line**

If any hex7 in those texts matches an open/closed issue's ID prefix, the
patch shows up as an indicator on that issue's kanban card, and the
issue is listed in the patch's "linked issues" section.

### Single-issue patch

Easiest: put the hex7 in brackets in the patch title.

```bash
git push rad HEAD:refs/patches \
  -o patch.message="[abc1234] fix: tighten auth check" \
  -o patch.message="Long-form description here."
```

Or include it inline:

```
feat: add csv export for abc1234
```

### Multi-issue patch (the radboard-specific trick)

When one patch resolves several issues, do **not** cram every ID into
the title. Instead, give the patch a clean title and put one issue ID
per commit subject:

```
Sprint cleanup batch         <- patch title (no hex needed)
├─ fix: validate input bounds for 0d948aa
├─ feat: add csv export for 3ca544a
└─ docs: clarify retry semantics for e9f1c22
```

Radboard scans all three commit subjects and links the patch to issues
`0d948aa…`, `3ca544a…`, and `e9f1c22…` automatically. No UI changes
needed on either side.

### Conventional commit recipe

A safe template for any commit subject:

```
<type>: <short summary> (<hex7>)
```

The `<hex7>` can appear anywhere in the subject — start, middle, end,
brackets, parens — the regex is `/[0-9a-f]{7}/gi`. Be wary of
accidental matches: 7 consecutive hex chars in a path or random string
will be treated as an issue prefix. Prefer the `(hex7)` or `[hex7]`
form for clarity.

## Naming conventions (branch, commit, patch)

Radboard parses hex7 prefixes from branch names, commit subjects, and
patch titles to link work to issues. Follow these formats so the board
populates automatically.

### Branch — `<hex7>-<short-slug>`

```bash
git switch -c abc1234-csv-export
```

Hex7 first, kebab-case slug after. No `feat/` or `fix/` prefix on
branches — that belongs in commit subjects.

### Patch title — `[<hex7>] <type>: <summary>`

Single issue:

```bash
git push rad HEAD:refs/patches \
  -o patch.message="[abc1234] feat: add csv export"
```

Multi-issue: clean title, hex7 in each commit subject instead.

### Commit subjects — hex7 per commit for multi-issue patches

Radboard scans every commit subject for hex7. Use one issue ID per
commit subject when a patch resolves multiple issues:

```
fix: validate input bounds for 0d948aa
feat: add csv export for 3ca544a
docs: clarify retry semantics for e9f1c22
```

Patch title can stay clean (no hex7 needed when commits carry them).

### Patch description — acceptance criteria as checklist

Copy the issue's acceptance criteria into the patch description as a
Markdown checklist. Reviewers tick boxes; radboard renders them in the
patch detail view, keeping issue intent traceable through review.

```
## Acceptance criteria
- [x] Export button in toolbar
- [x] UTF-8 BOM for Excel compatibility
- [ ] Unit tests for edge cases
```

### Closing — `--solved`, never `--closed`

```bash
rad issue state --solved <ID>
```

`--closed` = abandoned/won't-fix. `--solved` = merged as intended.
Multi-issue patches: solve each issue separately.

## Issue state semantics (radicle gotcha worth repeating)

Radboard maps Radicle issue states directly:

- `open` → Open column (or dynamic `state:*` column)
- `solved` → Closed column, "solved" badge — use for **completed** work
- `closed` → Closed column, "closed" badge — use for **abandoned /
  won't-fix**

When finishing work:

```bash
rad issue state --solved <ID>     # NOT --closed
```

Closed-as-abandoned and solved-as-done look different on the board.
Don't pick `--closed` out of GitHub muscle memory.

## Editing issue descriptions

Use `rad issue edit -d "…"` to fix or expand the description. Don't add
comments to patch up the description — radboard renders the description
prominently and comments separately. Comments are for discussion.

## Assignees

Radboard surfaces assignees as avatar chips on cards and filters in the
toolbar. Use the standard `rad issue assign`:

```bash
rad issue assign <ID> -a <DID>
rad issue assign <ID> -d <DID>     # unassign
```

Aliases are resolved through the local Radicle alias store — assign by
DID, the UI shows the alias.

## Worktree / sync conventions

Radboard creates patch worktrees as **siblings of the main clone**, e.g.
`<parent>/<repo>-<branch>/`. When scripting around an existing radboard
project:

- Don't put worktrees inside the main clone — radboard's local-repo
  scan won't find them and the user's worktree picker will desync.
- Default branch comes from the Radicle identity document, not from
  `origin/HEAD`. If you create patches against `main` but the repo's
  default is `master`, radboard's sync banner will flag every patch as
  behind. Match the repo's default branch.

## Putting it all together (end-to-end recipe)

For a brand-new project that should "just work" in radboard:

1. **Init repo and pick label vocabulary up front.** Decide your state
   columns now — easier than rewiring later.
   ```bash
   rad init -t "myproject" -d "..." --default-branch master
   ```
2. **Open issues with state + priority from the start.**
   ```bash
   rad issue open -t "Add CSV export" -d "..." \
     --labels state:triage --labels priority:medium --labels milestone:v0.1.0
   ```
3. **When you start work, move the card.**
   ```bash
   rad issue label <ID> -d state:triage
   rad issue label <ID> -a state:in-progress
   ```
4. **When you push a patch, encode the issue ID(s).**
   - Single issue: `[<hex7>]` in patch title.
   - Multiple issues: clean title, one `<hex7>` per commit subject.
5. **When the patch merges, mark issues solved.**
   ```bash
   rad issue state --solved <ID>
   ```
6. **For tracking dependencies**, add `blocked:<hex7>` labels — the
   blocker graph populates automatically.

Following this recipe means radboard's kanban view, priority ordering,
milestone progress bars, blocker chips, and patch indicators all light
up with zero extra configuration.

## Gotchas

1. `state:open` / `state:closed` are no-ops — `Open` and `Closed` are
   built-in columns. Removing them is fine, adding them is noise.
2. Only the four canonical `priority:*` values get the priority badge
   and ordering. `priority:p1` shows as a plain label.
3. The milestone prefix is **configurable** per board — don't assume
   `milestone:`.
4. `blocked:<hex7>` only links if the hex matches a real issue prefix
   in the same repo. Mismatches render as a plain blocker chip.
5. Patch-issue linking uses **7-char hex**. Shorter prefixes are
   ignored; longer ones still match on the first 7 chars but may also
   catch unintended substrings.
6. Use `rad issue state --solved`, not `--closed`, for completed work.
7. Closed/solved issues ignore lingering `state:*` labels — safe to
   leave the label in place after solving, but it has no effect.
8. Don't bake `state:`, `priority:`, `milestone:`, `blocked:`,
   `parent:`, or the bare `epic` label into label names users will
   pick (e.g. don't name a regular label `state-machine` — fine;
   `state:machine` — collides with the dynamic-column logic).
9. `parent:<hex7>` uses the same 7-char hex convention as
   `blocked:<hex7>` and patch↔issue linking. Mismatches render orange
   and non-clickable — verify the prefix matches the epic's id.
10. Removing the `epic` label from a parent does NOT clean up children's
    `parent:*` labels. Either re-add `epic` or strip the children
    manually with `rad issue label -d parent:<hex7>`.
