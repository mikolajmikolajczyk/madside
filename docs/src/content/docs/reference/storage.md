---
title: Storage
description: The IndexedDB schema — stores, keys, and indexes.
sidebar:
  order: 6
---

Projects live entirely in the browser's IndexedDB. There is no server.

- **Database name:** `madside`
- **Current version:** `2` (the v2 baseline; future bumps append migrations)

There are no production v1 databases — any pre-v2 store set is torn down and
replaced wholesale with the v2 baseline. Migrations from v3 onward run normally.

## Object stores

| Store | Key | Indexes | Value shape |
|-------|-----|---------|-------------|
| `projects` | `id` (string) | `byUpdatedAt` → `updatedAt` | `{ id, name, createdAt, updatedAt }` |
| `files` | `[projectId, path]` | `byProject` → `projectId` | `{ projectId, path, content: Uint8Array, updatedAt }` |
| `meta` | `key` (string) | — | `{ key, value: unknown }` |
| `snapshots` | `id` (string) | `byProject` → `projectId` | `{ id, projectId, ts, summary, tree: Record<string,string> }` |
| `blobs` | `hash` (string, sha-256 hex) | — | `{ hash, data: Uint8Array }` |
| `breakpoints` | `projectId` (string) | — | `{ projectId, bps: Record<string, number[]>, updatedAt }` |

## Notes

- **`files.path`** is POSIX with no leading slash (e.g. `src/main.asm`,
  `project.json`). Text is stored as UTF-8 bytes; binary is stored natively.
- **`snapshots.tree`** maps each file path to a blob hash; the actual bytes are
  deduplicated in the `blobs` store (content-addressable by sha-256).
- **`breakpoints.bps`** maps a file path to a list of 1-based line numbers.
- **`projects.id`** is a slugified name with a collision suffix.
