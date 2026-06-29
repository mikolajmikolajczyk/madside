---
title: Authoring a course
description: Write an interactive course — lessons, starter files, and declarative checks.
sidebar:
  order: 13
---

A **course** is interactive, in-app learning: a course holds ordered **lessons**, each combining theory (markdown), a starter project, and an automated **check** that verifies the learner's work. Courses are *content*, not plugins — no code to register, no build step. Drop a directory in and it shows up in the picker.

:::note
The format below is the same whether a course ships **with the app** (in the repo's `courses/` directory) or lives in your **own public GitHub repo** that learners load by pasting a URL. Write it once; see [Publish on GitHub](#publish-on-github) at the end for sharing.
:::

## Author in the app (Course Author)

The quickest way to build a course is the in-app **Course Author** — you don't
hand-write any of the layout below; the editor produces it for you, and you test
each lesson exactly as a learner will.

1. On the welcome screen's **Follow a course** section, click **Author a new
   course** (or **Import folder** / **Import .zip** to edit an existing one).
2. The course's **first lesson opens as an ordinary project** — the file tree
   shows just that lesson's starter (`src/…`, `project.json`), and you **build,
   run, and debug it like any project**. A **Course Author** panel and a **Course
   Preview** panel open alongside it.
3. In **Course Author**:
   - edit the course **title / description / machine** (its `course.json`);
   - the **Lessons** list — click a lesson to open it (the file tree switches to
     it), reorder with ↑ / ↓, delete, or **+ Add lesson** (seeded with a buildable
     starter);
   - for the open lesson, edit its **markdown** and build its **checks** with a
     form (one row per check kind — no JSON).
4. **Course Preview** renders the open lesson exactly as a learner sees it —
   markdown, lesson list, and a working **Check** button.
5. **↓ Export .zip** validates the course and downloads it; unzip into a public
   GitHub repo and [publish](#publish-on-github). (Round-trips with Import.)
6. **↑ Publish to GitHub** (when signed in) publishes straight to a repo you pick
   — under `courses/<slug>/` — and remembers it per course, so updates republish
   there. Re-edit later via the GitHub panel's **Import from GitHub → Courses → Edit**.

Under the hood a draft course is held in your browser; the editor reads and writes
the same directory layout documented below, so app-authored and hand-written
courses are identical. The rest of this page is the **format reference** — useful
for understanding what the editor produces, hand-editing, or publishing.

## Directory layout

A course is a directory under `courses/<id>/`, bundled at build time via Vite glob (the same mechanism as [templates](/docs/extending/templates/)):

```
courses/<id>/
  course.json                 # course metadata
  lessons/
    01-hello/
      lesson.md               # theory + instructions (required)
      files/                  # starter project the learner edits (required)
        project.json
        src/main.a65
      check.json              # declarative checks for the task (optional)
      solution/               # reference solution (optional)
        src/main.a65
    02-loops/
      ...
```

**Lesson order is the directory name** — the `01-`, `02-` numeric prefix sorts them. There is no list to maintain; add a directory and it slots into place.

## `course.json`

Course-level metadata only:

```json
{
  "title": "Atari Assembly Basics",
  "description": "Write your first 6502 programs for the Atari 8-bit.",
  "machine": "atari-xl",
  "order": 1
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | yes | Shown on the course card. |
| `description` | yes | One-line summary in the picker. |
| `machine` | yes | Machine id the course targets (`atari-xl`, `nes`, …). |
| `order` | no | Sort hint in the course list (ascending; missing sorts last). |

## A lesson

### `lesson.md`

Theory and instructions in Markdown. The **first `# ` heading becomes the lesson title** (falling back to the directory name). Use normal Markdown — headings, lists, bold, and code fences all render in the lesson panel:

```markdown
# Hello, Atari

The Atari draws its text screen straight out of RAM...

## Task

Finish the print loop in `src/main.a65` so it writes `msg` to the screen.
The label `start` must stay — it is the program entry point.
```

### `files/`

The **starter project** the learner opens — exactly a normal project tree, including a `project.json`. When the learner opens the lesson it becomes a real, persistent project (their edits survive navigating away and back), stamped so the app knows which lesson it belongs to. Leave a clear `; TODO` where the learner works:

```asm
        ldy #0
print
        ; TODO: load msg,y — if it's $ff jump to done; else store it
        ;       through (screen),y, bump y, loop back to print.
done
        jmp done
        run start
msg     dta d'HELLO ATARI!', $ff
```

The lesson's `project.json` selects the machine + toolchain like any project — see the [manifest reference](/docs/reference/manifest/).

### `solution/` (optional)

A reference solution, same paths as `files/` (e.g. `solution/src/main.a65`). Not shown automatically; it documents the intended answer and can back a future "show solution" affordance.

## `check.json` — declarative checks

The lesson's task is verified by the **Check** button: the app assembles the project and, if a check needs it, runs it headlessly for a few frames, then evaluates each assertion and shows a per-line pass/fail report. Checks are a JSON array — the lesson passes only if **all** pass:

```json
{
  "checks": [
    { "kind": "build" },
    { "kind": "label", "name": "start" }
  ]
}
```

Operands are written as hex (`$94`, `$02C6`) or decimal — the way assembly authors read them.

### Check kinds

| Kind | Fields | Passes when |
|------|--------|-------------|
| `build` | — | The project assembles cleanly. |
| `label` | `name`, `addr?` | A label `name` exists in the assembled symbol table; if `addr` is given, it resolves to that address. (Case-insensitive — MADS uppercases its symbol table.) |
| `register` | `reg`, `equals`, `afterFrames?` | After running, CPU register `reg` (`a`/`x`/`y`/`sp`/`pc`) equals `equals`. |
| `memory` | `addr`, `equals`, `space?`, `afterFrames?` | After running, the bytes at `addr` equal `equals` (one or more space-separated bytes). `space` selects a [named memory space](/docs/reference/memory-spaces/) (e.g. NES `ppu`/`oam`); default is the CPU bus. |

`afterFrames` advances the emulator that many display frames **after your program starts** before reading (default `0`). `register` and `memory` checks run the program; `build` and `label` only assemble.

:::note[`afterFrames` counts from when your code starts, not from load]
The runner first lets the machine boot — it advances until the CPU is executing inside your program's loaded address range, *then* counts `afterFrames`. So a small, intuitive value works: `afterFrames: 2` means "two frames after my code begins running", not "two frames after a cold start" (which used to read **pre-boot** `$00`). A few frames is plenty for a program that writes a value and loops.

This boot allowance is automatic — the active machine reports its program's load range (Atari parses the XEX; NES seeds the PC from the reset vector and runs from load), and the runner advances up to a generous cap until the PC lands in that range. If you ever need to read the very first frame of your program, use `afterFrames: 0` or `1`. `build` and `label` checks never run the program, so they're still the strongest, flake-free gates when a runtime read isn't essential.
:::

### Examples

```json
{ "checks": [
  { "kind": "build" },
  { "kind": "label", "name": "fill" }
] }
```

```json
{ "checks": [
  { "kind": "build" },
  { "kind": "memory", "addr": "$02C6", "equals": "$94", "afterFrames": 2 }
] }
```

```json
{ "checks": [
  { "kind": "register", "reg": "a", "equals": "$94", "afterFrames": 1 }
] }
```

A pure-theory lesson simply omits `check.json` (the Check button is disabled).

## Testing a course

- **Authoring in the app:** the **Course Preview** panel renders each lesson as a
  learner sees it, and its **Check** button runs the open lesson's checks against
  your starter — so you verify a lesson without leaving the editor. Build & run the
  open lesson directly too (it's a normal project).
- **A course bundled with the app:** add it under `courses/<id>/`, start the dev
  server, and open it from the welcome screen's **Follow a course** section
  (**File → New project** reopens that screen).

Confirm each assertion reports what you expect, and keep any `solution/` assembling
cleanly as a regression guard. Keep checks **lenient enough to not frustrate,
strict enough to confirm the concept** — e.g. lesson 1 might only assert `build` +
the entry label, not the exact bytes, so a learner who solves it a different way
still passes.

## Publish on GitHub

Anyone can publish a course from a **public GitHub repo** — no app code changes, no account, no submission. The repo *is* the course.

1. **Lay the course at the repo root** — `course.json` + `lessons/` exactly as above. (The whole repo is the course; there's no `courses/<id>/` wrapper here.)
2. **Push it to a public GitHub repo.**
3. **Share the URL.** A learner opens the welcome screen's **Follow a course** section, pastes `github.com/<owner>/<repo>` (or the shorthand `<owner>/<repo>`), and the course installs + opens. They can **Refresh from repo** later to pull your updates, and remove it anytime.

```
github.com/you/my-atari-course
  course.json
  lessons/01-hello/lesson.md, files/…, check.json
  lessons/02-…/
```

**Pin a ref — and know the CDN caches branches.** A bare `<owner>/<repo>` tracks your default branch, but jsDelivr **caches a branch for hours**, so pushed edits don't reach learners promptly (and *Refresh* re-fetches the same cached branch). A **tag or commit is immutable**, so jsDelivr serves it fresh the first time and forever after. So: develop on a branch, but **release with a tag** and share that — `github.com/you/my-atari-course/tree/v1` or `you/my-atari-course@v1`. Bump the tag for each update; learners on the old tag are unaffected, those you point at the new one get it instantly.

**What's fetched, and the limits.** Courses load over the jsDelivr CDN (CORS-enabled, cached) — only `course.json` and `lessons/**` are read; everything else in the repo is ignored. Constraints today:

- **GitHub public repos only.** Other hosts (GitLab, Codeberg, self-hosted) need a proxy and aren't supported yet.
- **Data only.** Courses are markdown + assembly + declarative `check.json` — they cannot ship plugins or run JavaScript. Lesson markdown is sanitized (no raw HTML).
- **Size caps:** ≤ 1000 files, ≤ 100 lessons, ≤ 8 MB total; a malformed `course.json`/`check.json` is rejected with an error.

That's the whole contract — push a repo, share the link.
