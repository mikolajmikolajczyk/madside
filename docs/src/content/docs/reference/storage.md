---
title: Storage
description: The IndexedDB schema — stores, keys, and indexes.
sidebar:
  order: 6
---

Projects live entirely in the browser's IndexedDB. There is no server.

- **Database name:** `madside`
- **Current version:** `4` (v2 baseline + the v3 `courses` store + the v4 `builds` store)

There are no production v1 databases — any pre-v2 store set is torn down and
replaced wholesale with the v2 baseline. From there, versioned migrations run
normally (v3 added the `courses` store; v4 added the `builds` store).

## Object stores

| Store | Key | Indexes | Value shape |
|-------|-----|---------|-------------|
| `projects` | `id` (string) | `byUpdatedAt` → `updatedAt` | `{ id, name, createdAt, updatedAt }` |
| `files` | `[projectId, path]` | `byProject` → `projectId` | `{ projectId, path, content: Uint8Array, updatedAt }` |
| `meta` | `key` (string) | — | `{ key, value: unknown }` |
| `snapshots` | `id` (string) | `byProject` → `projectId` | `{ id, projectId, ts, summary, tree: Record<string,string> }` |
| `blobs` | `hash` (string, sha-256 hex) | — | `{ hash, data: Uint8Array }` |
| `breakpoints` | `projectId` (string) | — | `{ projectId, bps: Record<string, number[]>, updatedAt }` |
| `builds` | `projectId` (string) | — | `{ projectId, build: StoredBuild, updatedAt }` |
| `courses` | `sourceId` (string, e.g. `gh:owner/repo@ref`) | — | `{ sourceId, kind, owner, repo, ref, resolvedRef?, fetchedAt, files: { path, content }[] }` |

## Notes

- **`files.path`** is POSIX with no leading slash (e.g. `src/main.asm`,
  `project.json`). Text is stored as UTF-8 bytes; binary is stored natively.
- **`snapshots.tree`** maps each file path to a blob hash; the actual bytes are
  deduplicated in the `blobs` store (content-addressable by sha-256).
- **`breakpoints.bps`** maps a file path to a list of 1-based line numbers.
- **`builds.build`** holds the last build of a project — `StoredBuild` is
  `{ ok, binary?, sourceMap?, labels?, diagnostics?, stdout, stderr, exitCode }`.
  Persisting it lets a page reload restore the OUTPUT panel + inline error
  markers and the binary, so **Run** works without a rebuild. The `Uint8Array`
  (`binary`) and `Map` (`labels`, `sourceMap`) round-trip through IndexedDB's
  structured clone, so the shape is stored as-is — no serialization. Like
  breakpoints, this is workflow/derived state rather than a project artifact, so
  it is **excluded from ZIP export**.
- **`projects.id`** is a slugified name with a collision suffix.
