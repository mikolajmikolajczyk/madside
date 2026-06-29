---
title: GitHub sync
description: Back up your projects to your own GitHub repo and continue them on any device.
sidebar:
  order: 9
---

By default madside keeps everything in your browser — there is no server, and your work never leaves your machine. If you want a backup you control, or you want to start on your laptop and continue on a tablet, you can connect **your own** GitHub repositories. madside stores nothing itself: your files live in your browser and in the repos you choose. Each project is bound to its own repo, so different projects can live in different repos.

:::note
Everything here is optional. If you never connect an account, madside works exactly as before — fully local, no account, no network.
:::

## Connect your account

Open **Help → GitHub…** and sign in with GitHub. madside only uses your GitHub identity to read and write the repos you pick — it keeps no account of its own and no password.

Once you're signed in, the **status bar** (bottom of the window) shows your GitHub username and the current sync state. If your session ever expires — common on tablets after a while — the indicator flips to **signed out** so you know to sign in again, instead of silently failing to sync.

For madside to write to a repo, install its GitHub app on that repo — the GitHub panel (**Help → GitHub…**) has an **Add a repo…** link that opens the install page. A repo can be private. You can grant as many repos as you like; each project remembers which one it belongs to.

## Save to GitHub

Save the current project with any of:

- **Ctrl+Shift+S**,
- **File → GitHub → Save to GitHub**, or
- the **Save to GitHub** button on the toolbar.

The first time you save a project, the dialog lets you **choose which repo** it goes to. After that the project is bound to that repo and saves go straight there — different projects can live in different repos. The dialog also asks for a short commit message and offers **Amend my last commit** (on by default): repeated saves update your previous commit instead of piling up a new one. If someone else has committed since, it harmlessly adds a new commit instead.

Only your source files are saved. Build output is left out, the same as when you export a ZIP.

## Continue on another device

On a second device, sign in with the same account, then **import** the project (see below) or, if it's already local, **File → GitHub → Pull from GitHub** to bring its latest files in.

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

## Import projects and courses

Open **Help → GitHub…** → **Import from GitHub**. Pick a repo (any you can access — your own, or a collaborator's that has the app installed) and it lists that repo's **projects** and **courses**. **Import** a project to copy it into your browser (bound to that repo, so saves go back there); **Edit** a course to open it as a draft in the Course Author. This is how you pull one project from a friend's repo while your own projects keep syncing to yours.

## Other actions

From **File → GitHub** you can also:

- **View on GitHub** — open the project's folder in the repo in a browser.
- **History on GitHub** — open the repo's commit history for the project.
- **Remove from GitHub** — delete the project's folder from the repo (your local copy stays).

## Courses

If you author [courses](/docs/using/courses/), the Course Author's **↑ Publish to GitHub** lets you pick which repo to publish to (remembered per course, like projects). Publish a course to a public repo while your projects stay in a private one — no switching. Edit a published course later via **Import from GitHub → Courses → Edit**.

:::note
madside is not a storage service. It holds none of your data — your projects live in your browser and in the GitHub repo you own and control.
:::
