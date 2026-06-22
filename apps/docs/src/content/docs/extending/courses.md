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

## Testing a course locally

1. Add your course under `courses/<id>/` and start the dev server.
2. Open it from the welcome screen's **Courses** section (**File → New project** reopens that screen).
3. Work a lesson, press **Check**, and confirm each assertion reports what you expect. Keep `solution/` assembling cleanly as a regression guard.

Keep checks **lenient enough to not frustrate, strict enough to confirm the concept** — e.g. lesson 1 might only assert `build` + the entry label, not the exact bytes, so a learner who solves it a different way still passes.

## Publish on GitHub

Anyone can publish a course from a **public GitHub repo** — no app code changes, no account, no submission. The repo *is* the course.

1. **Lay the course at the repo root** — `course.json` + `lessons/` exactly as above. (The whole repo is the course; there's no `courses/<id>/` wrapper here.)
2. **Push it to a public GitHub repo.**
3. **Share the URL.** A learner opens the welcome screen's **Courses** section, pastes `github.com/<owner>/<repo>` (or the shorthand `<owner>/<repo>`), and the course installs + opens. They can **Refresh from repo** later to pull your updates, and remove it anytime.

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
