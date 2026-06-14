---
title: Authoring a course
description: Write an interactive course — lessons, starter files, and declarative checks.
sidebar:
  order: 12
---

A **course** is interactive, in-app learning: a course holds ordered **lessons**, each combining theory (markdown), a starter project, and an automated **check** that verifies the learner's work. Courses are *content*, not plugins — no code to register, no build step. Drop a directory in and it shows up in the picker.

:::note
This page covers writing a course that ships **with the app** (in the repo's `courses/` directory). Publishing a course from your **own GitHub repo** (so learners load it by pasting a URL) is a separate, upcoming feature — the on-disk format described here is identical, so anything you author now will work either way.
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

`afterFrames` advances the emulator that many display frames before reading (default `0`). `register` and `memory` checks run the program; `build` and `label` only assemble.

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
2. Open it from the welcome screen's **Courses** section, or **File → Courses**.
3. Work a lesson, press **Check**, and confirm each assertion reports what you expect. Keep `solution/` assembling cleanly as a regression guard.

Keep checks **lenient enough to not frustrate, strict enough to confirm the concept** — e.g. lesson 1 might only assert `build` + the entry label, not the exact bytes, so a learner who solves it a different way still passes.
