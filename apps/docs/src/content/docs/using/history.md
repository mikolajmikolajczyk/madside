---
title: History
description: Automatic and manual snapshots, restore, and diff.
sidebar:
  order: 8
---

madside snapshots your project as you work so you can roll back. Snapshots are stored in the browser alongside the project and are content-addressed, so unchanged files are shared between snapshots rather than copied.

## When snapshots are taken

- **Automatically** after 30 seconds of no edits.
- **On Ctrl+S** (save + assemble + snapshot).
- **Manually** via **File → Snapshot now**, or the **Snapshot now** button in the History dialog.

Automatic snapshots are pruned over time; manual snapshots are kept.

## The History dialog

Open **File → History…** to see the project's snapshots, newest first. Each row shows when it was taken, its type tag, and the number of files. For each snapshot you can:

- **Diff** — compare it against the next-older snapshot. The diff lists added, removed, and modified files plus an unchanged count. The oldest snapshot has nothing to diff against.
- **Restore** — overwrite the project's files with the snapshot's contents.
- **Delete** — remove the snapshot from the list.

:::caution
Restoring overwrites your project files with the snapshot's contents, and any files you added since are removed. Take a fresh snapshot first if you might want the current state back — you can re-restore from it.
:::
