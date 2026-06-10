---
name: radicle
description: >
  Radicle code forge operations — issues, patches, sync, clone, inspect.
  Use when working with rad CLI, Radicle repos, patches (Radicle PRs),
  or Radicle issues. Auto-trigger on: rad commands, RID references,
  Radicle workflow questions, patch/issue management in Radicle repos.
triggers:
  - rad
  - radicle
  - rid
  - "rad:"
  - rad clone
  - rad issue
  - rad patch
  - rad node
  - rad auth
  - rad sync
  - cob
  - seed node
  - did:key
min_trust: guest
user-invocable: false
allowed-tools: Bash
---

# Radicle Skill

Radicle is a sovereign, peer-to-peer code forge built on Git. No central
server — every user runs a node. Repos, issues, and patches are Git objects
replicated via gossip protocol. All actions cryptographically signed.

## Core concepts

- **RID** — Repository ID, e.g. `rad:z3Tr6bC7ctEg2EHmLvknUr29mEDLH`. Globally unique URN derived from identity document. Use `rad .` to show current repo RID.
- **DID** — Decentralized Identifier (user/device), e.g. `did:key:z6Mk...`. Each device has its own DID. Do NOT share keys across devices.
- **NID** — Node ID, the encoded public key part of DID. Get with `rad node status --only nid`.
- **Delegate** — Repo owner/maintainer identified by DID. Can merge patches, manage issues, modify permissions. Repo starts with one delegate (creator).
- **Patch** — Radicle's pull request. A COB (Collaborative Object) with revisions, reviews, comments. Created by pushing to `refs/patches`.
- **Revision** — Immutable version of a patch. Each update creates new revision. Initial revision ID = patch ID.
- **COB** — Collaborative Object. Git-native social artifacts (issues, patches, identities). Stored as commit DAGs under `refs/cobs/`. CRDTs for consistency.
- **Seed node** — Always-on node that hosts and syncs repos. Like BitTorrent seeders. Can be public (open policy) or community (selective policy).
- **Scope** — Which peers' data to replicate. `followed` = delegates + explicitly followed peers (default). `all` = everyone.

## Architecture (what you need to know)

### Two copies model
- **Working copy** — your normal git checkout
- **Stored copy** — bare repo managed by radicle-node, interacted with via `git push rad` / `git pull rad`
- `rad` remote created by `rad init` or `rad clone`. Uses `git-remote-rad` helper for `rad://` URLs.
- Push/pull to `rad` remote is LOCAL operation. Changes propagate to network automatically when online.

### Storage
- All repos stored under `~/.radicle/storage/`
- Peer data stored via Git namespaces (NID as namespace) in same repo
- Shared object database across namespaces — efficient
- Config at `~/.radicle/config.json` (`rad self --config` for path)

### Network
- Gossip protocol: 3 message types (node announcements, inventory announcements, ref announcements)
- Data transfer: Git fetch protocol over encrypted Noise XK connections
- Bootstrap nodes: `iris.radicle.xyz`, `rosa.radicle.xyz` (Radicle team)
- Default port: `8776`
- Tor support: mixed mode, full proxy, transparent proxy

### Canonical state
- Determined dynamically by delegate threshold (defined in identity document)
- If threshold=1 and you're sole delegate, your push to default branch IS canonical
- Multi-delegate: need threshold-many delegates to agree on same commit

## Identity & status

```
rad self                    # Show full identity info
rad self --did              # Show your DID
rad self --nid              # Node ID
rad self --alias            # Node alias
rad self --home             # Radicle home dir
rad self --config           # Config file location
rad self --ssh-key          # Public key in OpenSSH format
rad node status             # Node running? Connected peers?
rad node status --only nid  # Just the NID
rad node start              # Start node (background daemon)
rad node start --foreground # Start in foreground (for debugging)
rad node stop               # Stop node
rad node connect <NID>@<host>:<port>  # Connect to specific peer
rad inspect                 # Inspect current repo
rad inspect --rid           # Show repo RID
rad inspect --delegates     # Show repo delegates
rad inspect --payload       # Name, description, default branch
rad inspect --visibility    # Public or private
rad inspect --policy        # Seeding policy for repo
rad .                       # Shortcut: show current repo RID
rad config                  # Show current config
rad config edit             # Edit config in $EDITOR
```

## Repo initialization & publishing

```
rad init                              # Init new public Radicle repo in cwd
rad init --private                    # Init private repo (not announced)
rad publish                           # Make private repo public
rad ls                                # List repos you've contributed to
rad ls --seeded                       # List all seeded repos
rad ls --private                      # List private repos
```

`rad init` gathers: name, description, default branch, visibility. Creates
`rad` remote in working copy. You become sole delegate.

Use `-t`, `-d` flags or interactive editor. First line = title, rest = description.

## Issues

### List
```
rad issue list              # Open issues (default)
rad issue list --all        # All issues
rad issue list --closed     # Closed (abandoned/won't-fix) issues
rad issue list --solved     # Solved (completed) issues
rad issue list --assigned   # Assigned to me
rad issue list --assigned <DID>  # Assigned to specific person
```

### Create
```
rad issue open                                        # Opens $EDITOR
rad issue open -t "Title" -d "Description"
rad issue open -t "Title" -d "Description" --labels bug --labels urgent
rad issue open -t "Title" -d "Description" --assignees <DID>
```

> **CRITICAL — label syntax:** `--labels` takes ONE label per occurrence.
> Repeat the flag for multiple labels. **Never** pass a comma-separated
> list — `--labels bug,urgent` creates a single literal label
> `"bug,urgent"`, not two labels. Same rule for `--assignees`.

> **CRITICAL — only delegates can apply labels.** A non-delegate calling
> `rad issue open --labels …` (or `rad issue label -a …`) gets
> `not authorized to apply Label`. Non-delegates must open issues
> without labels and ask a delegate to label later.

### View
```
rad issue show <ID>
rad issue show <ID> --header   # Title only, no comments
```

Short IDs work — first few chars of hash sufficient if unambiguous.

### Modify
```
rad issue edit <ID> -t "New title"
rad issue edit <ID> -d "New description"
rad issue edit <ID> -t "New title" -d "New description"
```

> **IMPORTANT:** Use `rad issue edit` to update/correct issue descriptions.
> Use comments only for discussion, decisions, or status updates separate
> from the main description. Do not add comments to fix/expand descriptions.

### State transitions
```
rad issue state --solved <ID>   # Completed work (USE THIS for done)
rad issue state --closed <ID>   # Abandoned / won't-fix
rad issue state --open <ID>     # Reopen
```

> **IMPORTANT:** Use `--solved` for completed issues. `--closed` means
> abandoned or won't-fix. This is NOT like GitHub where "closed" = done.

### Comments
```
rad issue comment <ID> -m "Comment text"
rad issue comment <ID> --reply-to <COMMENT_ID> -m "Reply"
rad issue comment <ID> --edit <COMMENT_ID> -m "Edited text"
```

### Labels & assignees
```
rad issue label <ID> -a bug -a urgent       # Add multiple — repeat -a per label
rad issue label <ID> -d bug                 # Remove label
rad issue assign <ID> -a <DID>              # Add assignee
rad issue assign <ID> -d <DID>              # Remove assignee
```

> **Same rule applies to `-a` / `-d`:** one label per flag occurrence.
> `rad issue label <ID> -a "bug,urgent"` creates a literal `"bug,urgent"`
> label. Always repeat `-a bug -a urgent`.

## Patches (Radicle PRs)

### Creating a patch
```bash
git checkout -b my-feature
# ... make changes, commit ...
git push rad HEAD:refs/patches        # Opens editor for title/description
```

This creates a patch and sets up remote tracking branch `rad/patches/<PATCH_ID>`.
Subsequent pushes from same branch update the patch (create new revision).

Shortcut alias: `git config alias.patch 'push rad HEAD:refs/patches'` → `git patch`

### Push options
```bash
git push rad -o patch.draft           # Open as draft
git push rad -o patch.message="msg"   # Provide revision message inline
git push rad -o sync                  # Force network sync after push
git push rad -o no-sync               # Don't wait for sync
```

### Updating a patch
```bash
# Make changes, amend/add commits
git push --force                      # Force needed if rebased/amended
```

Each update creates new immutable revision. Non-destructive even on force-push.

### List
```
rad patch list              # Open patches (default)
rad patch list --all        # All patches
rad patch list --draft      # Drafts only
rad patch list --merged     # Merged only
rad patch list --archived   # Archived only
rad patch list --authored   # My patches
```

### View
```
rad patch show <ID>             # Show patch details + timeline
rad patch show <ID> -p          # Show with diff
rad patch diff <ID>             # Show diff only
rad patch diff <ID> -r <REV>   # Diff specific revision
```

### Review
```
rad patch review <ID> --accept                          # Accept
rad patch review <ID> --accept -m "LGTM"                # Accept with message
rad patch review <ID> --reject -m "Needs changes"       # Reject
rad patch review <ID> -r <REV> --accept                 # Review specific revision
```

### Comment on patch
```
rad patch comment <REVISION_ID> -m "Comment"
rad patch comment <REVISION_ID> --reply-to <COMMENT_ID> -m "Reply"
rad patch comment <REVISION_ID> --edit <COMMENT_ID> -m "Edited"
```

### Manage patches
```
rad patch edit <ID> -m "Updated description"
rad patch edit <ID> --revision <REV> -m "Revision note"
rad patch ready <ID>              # Draft → open
rad patch archive <ID>            # Archive
rad patch assign <ID> -a <DID>    # Assign reviewer
rad patch label <ID> -a <LABEL>   # Add label
rad patch checkout <ID>           # Checkout patch branch locally
rad patch set <ID>                # Set upstream to patch ref
```

### Merging a patch (delegate workflow)
```bash
rad patch checkout <PATCH_ID>     # Switch to patch branch
git rebase main                   # Optional: rebase onto main
git push --force                  # Update patch with rebased revision
git checkout main
git merge patch/<PATCH_ID>        # Merge into main
git push rad main                 # Push — auto-marks patch as merged
```

When Radicle detects patch revision merged into default branch, patch
status automatically changes to "merged".

## Sync & network

```
rad sync                        # Sync current repo (fetch + announce)
rad sync --fetch                # Fetch only
rad sync --announce             # Announce only
rad sync -t 30s                 # Custom timeout (default 9s)
rad sync -r 5                   # Sync with 5 seeds
rad sync --seed <NID>           # Sync with specific seed
rad sync <RID>                  # Sync specific repo
rad sync status                 # Show sync status
rad sync --inventory            # Announce full inventory to network
```

## Clone & seeding

```
rad clone <RID>                 # Clone repo (updates seeding policy + fetches + creates checkout)
rad clone <RID> <PATH>          # Clone to specific path
rad clone <RID> --seed <NID>    # Clone from specific seed (REQUIRED for private repos)
rad clone <RID> --scope all     # Follow all peers, not just delegates
rad seed <RID>                  # Seed without checkout (like starring)
rad seed <RID> --scope all      # Seed with all peers — REQUIRED if you want
                                # external contributors' COBs (issues/patches/
                                # comments from non-delegates) to reach you.
                                # Default `followed` scope only syncs delegates.
rad unseed <RID>                # Stop seeding
rad checkout <RID>              # Create working copy from already-seeded repo
```

`rad clone` = `rad seed` + `rad sync -f` + `rad checkout` + `rad remote add` (for delegates)

### Remotes
```
rad remote add <NID> --name <alias>   # Add peer as git remote
rad remote list                        # List remotes
rad remote list --untracked            # Peers followed but not tracked
```

After adding remote, `git fetch <alias>` pulls their branches.

## Inbox / notifications
```
rad inbox                       # Notifications for current repo
rad inbox --all                 # All repos
rad inbox show <N>              # Show notification by number
```

## Follow & block
```
rad follow <NID>                # Follow a peer
rad unfollow <NID>              # Unfollow
rad block <RID|NID>             # Block repo or node from seeding
rad unblock <RID|NID>           # Unblock
```

## Private repositories

- Init with `rad init --private`
- Not announced to network. Invisible to unauthorized peers.
- Delegates always have access.
- Add peers to allow list: `rad id update --title "Allow X" --allow <DID>`
- Remove: `rad id update --title "Revoke X" --disallow <DID>`
- Need at least one trusted seed node in allow list for reliable sync
- Clone requires `--seed` flag pointing to node known to have the repo
- Make public later with `rad publish`

## Identity management
```
rad auth                        # Create new identity (first time)
rad id update --title "reason" --allow <DID>      # Add to allow list
rad id update --title "reason" --disallow <DID>    # Remove from allow list
rad id update --title "reason" --visibility private  # Make repo private
```

## Seeding policy (seed node operators)
```json
// Permissive (public seed — seeds everything)
{ "node": { "seedingPolicy": { "default": "allow", "scope": "all" } } }

// Selective (community seed — manual allow per repo)
{ "node": { "seedingPolicy": { "default": "block" } } }
```

Override per-repo: `rad seed <RID>` to allow, `rad block <RID>` to block.

## Git commit signing with Radicle key
```bash
git config user.signingKey "$(rad self --ssh-key)"
git config gpg.format ssh
git config gpg.ssh.program ssh-keygen
git config gpg.ssh.allowedSignersFile .gitsigners
git config commit.gpgsign true
```
Optional — Radicle signs everything internally anyway.

## Common flags (most commands)

| Flag | Effect |
|------|--------|
| `-q, --quiet` | Suppress output |
| `-v, --verbose` | Verbose output |
| `--no-announce` | Don't announce changes to network |
| `-r, --repo <RID>` | Operate on specific repo (default: cwd) |

## Gotchas

1. `rad patch comment` takes a **revision ID**, not a patch ID
2. Issue `--solved` ≠ `--closed`. Solved = done. Closed = abandoned.
3. `rad issue edit` for description fixes, not comments
4. Node must be running (`rad node start`) for sync/clone operations
5. `rad sync` default timeout is 9s — increase with `-t` for large repos
6. Patches are Git branches pushed to rad remote — `git push rad HEAD:refs/patches` creates, subsequent `git push` updates
7. Each device needs its OWN DID. Do not copy keys between devices.
8. `git push rad` is a LOCAL operation — changes propagate to network automatically
9. Force push to patch is safe — creates new immutable revision, doesn't destroy history
10. Private repos need `--seed <NID>` on clone — routing table won't know about them
11. Short COB IDs work in most commands (first few hex chars)
12. `rad .` is fastest way to check current repo's RID
13. If `git pull` shows "Already up to date" but you expect changes, run `rad sync --fetch` first
14. Tor connections: use `rad node connect <NID>@<onion>:8776` format
15. **Label/assignee flags are repeated, not comma-joined.** `--labels a --labels b` and `-a a -a b`, never `--labels a,b` — the comma becomes part of the label string
