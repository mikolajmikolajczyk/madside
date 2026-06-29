---
title: GitHub sync
description: Back up your projects to your own GitHub repo and continue them on any device.
sidebar:
  order: 9
---

By default madside keeps everything in your browser — there is no server, and your work never leaves your machine. If you want a backup you control, or you want to start on your laptop and continue on a tablet, you can connect **your own** GitHub repository. madside stores nothing itself: your files live in your browser and in the repo you choose.

:::note
Everything here is optional. If you never connect an account, madside works exactly as before — fully local, no account, no network.
:::

## Connect your account

Open **Help → GitHub…** and sign in with GitHub. madside only uses your GitHub identity to read and write the one repo you pick — it keeps no account of its own and no password.

Once you're signed in, the **status bar** (bottom of the window) shows your GitHub username and the current sync state. If your session ever expires — common on tablets after a while — the indicator flips to **signed out** so you know to sign in again, instead of silently failing to sync.

## Pick a project repo

In the GitHub panel, choose the repository madside should use under **Project repo**. You can pick any repo you own (private is fine). For madside to write to it, install its GitHub app on that repo — the panel shows a link to do so.

This repo holds all your synced projects, each in its own folder. One repo, many projects.

## Save to GitHub

With an account connected and a repo selected, save the current project with any of:

- **Ctrl+Shift+S**,
- **File → GitHub → Save to GitHub**, or
- the **Save to GitHub** button on the toolbar.

A dialog asks for a short commit message. It also offers **Amend my last commit** (on by default): when ticked, repeated saves update your previous commit instead of piling up a new commit every time — so your history stays tidy. If someone else has committed since, it harmlessly adds a new commit instead.

Only your source files are saved. Build output is left out, the same as when you export a ZIP.

## Continue on another device

On a second device, connect the same account and repo, then **File → GitHub → Pull from GitHub** to bring the project's latest files into that device.

:::caution
Pulling overwrites the local copy with the repo's version. Before it does, madside takes a [snapshot](/docs/using/history/) of your current local files, so you can roll back if the pull wasn't what you wanted.
:::

## Auto-sync

Auto-sync saves and pulls for you, without using the menu. It is **off by default** and configured **per device**: enable it in **Help → GitHub…** under **Auto-sync to GitHub**. When on, madside:

- **pushes** your edits a while after you stop typing, and
- **pulls** the latest when you open a project or return to the tab.

**Push after N seconds idle** (default 30) sets how long it waits after your last edit before pushing. A longer wait means fewer, larger saves; a shorter wait syncs sooner.

The status bar reflects what's happening:

| Indicator | Meaning |
|-----------|---------|
| **synced** | Everything is pushed. |
| **unsynced** | You have local edits not yet pushed. |
| **syncing…** | A push or pull is in progress. |
| **sync paused** | This project changed on GitHub while you also have local edits — see below. |
| **sync error** | The last sync failed. |
| **auto-sync off** | Auto-sync is disabled on this device. |

### When sync pauses

madside never merges and never overwrites silently. If a project changed in the repo while you also have unpushed local edits, auto-sync **pauses for that project** and tells you. Nothing is lost. Decide which side you want and resolve it from **Help → GitHub…**:

- **Pull from GitHub** to take the repo's version (your current local files are snapshotted first), or
- **Save to GitHub** to push your version over it.

Auto-sync resumes for that project once the two sides match again.

## Import a project from your repo

To pull a project the repo already has onto a fresh device, open **Help → GitHub…** and use **Import a project** — pick one and it's copied into your browser as a new local project.

## Other actions

From **File → GitHub** you can also:

- **View on GitHub** — open the project's folder in the repo in a browser.
- **History on GitHub** — open the repo's commit history for the project.
- **Remove from GitHub** — delete the project's folder from the repo (your local copy stays).

## Courses and settings

If you author [courses](/docs/using/courses/), you can publish them to GitHub and edit them later via **Courses in repo** in the GitHub panel. By default courses go to your main repo, but you can set a **separate courses repo** (GitHub panel → **Courses repo**) — handy for keeping your projects repo private while publishing courses to a public one, with no switching. You can also save your **theme** to the repo so it follows you between devices.

:::note
madside is not a storage service. It holds none of your data — your projects live in your browser and in the GitHub repo you own and control.
:::
