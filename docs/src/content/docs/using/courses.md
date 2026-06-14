---
title: Courses
description: Taking an interactive, guided course inside madside.
sidebar:
  order: 10
---

:::note
Courses are available in **v0.9.5**.
:::

Where the rest of this section documents *the IDE*, **courses** teach *the machine* — they're the guided, hands-on counterpart to these docs. A course is an ordered set of lessons; each lesson combines a written explanation with a starter project you edit in place, and most lessons end with a task madside can check for you.

## Starting a course

Pick a course the same way you pick a template:

- **File → Courses → …**, or
- the **welcome picker**, which shows a card per course with its target machine and lesson count.

Selecting a course opens its first lesson as a project in *course mode*.

## Course mode

In course mode the left column splits: the **Files** panel stays on top and a **lesson panel** appears below it. The lesson panel has:

- the course title and your position (**Lesson n / total**);
- a numbered list of all lessons — click any one to jump to it;
- the lesson's text (theory and instructions); and
- a footer with **‹ Prev**, **Check**, and **Next ›**.

You work in the editor and emulator exactly as in any other project — [build](/docs/using/building/), [run](/docs/using/running/), and [debug](/docs/using/debugging/) all behave normally.

## The Check button

When a lesson has a task, the **Check** button assembles your code and verifies it against the lesson's checks (for example: that it builds, that a label exists, or that a register or memory location holds an expected value after running). The result appears in the lesson panel as a pass/fail list, one line per check. Lessons that are pure theory have no checks, and Check is disabled for them.
