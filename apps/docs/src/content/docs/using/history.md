---
title: History
description: Automatic and manual snapshots, restore, and diff.
sidebar:
  order: 8
---

madside snapshots your project as you work so you can roll back. Snapshots are stored in the browser alongside the project and are content-addressed, so unchanged files are shared between snapshots rather than copied.

## When snapshots are taken

- **Automatically** after 30 seconds of no edits — tagged `auto`.
- **On Ctrl+S** (save + assemble + snapshot), or via **File → Snapshot now** / the **Snapshot now** button — all tagged `manual`.

So a snapshot carries one of two tags: `auto` or `manual`. Automatic snapshots are pruned over time (the most recent 100 are kept); every `manual` snapshot is kept indefinitely.

## The History dialog

Open **File → History…** to see the project's snapshots, newest first. Each row shows when it was taken, its type tag, and the number of files. For each snapshot you can:

- **Diff** — compare it against the next-older snapshot. The diff lists added, removed, and modified files plus an unchanged count. The oldest snapshot has nothing to diff against.
- **Restore** — overwrite the project's files with the snapshot's contents.
- **Delete** — remove the snapshot from the list.

:::caution
Restoring overwrites your project files with the snapshot's contents, and any files you added since are removed. Take a fresh snapshot first if you might want the current state back — you can re-restore from it.
:::
