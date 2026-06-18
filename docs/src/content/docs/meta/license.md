---
title: License
description: madside is licensed under AGPL-3.0-or-later — what that means and why.
sidebar:
  order: 2
---

madside is licensed under the **GNU Affero General Public License, version 3.0 or later** (AGPL-3.0-or-later). The full text lives in the [`LICENSE`](https://www.gnu.org/licenses/agpl-3.0.html) file at the repository root.

## What this means in two sentences

You can use, study, modify, and share madside freely. But if you distribute a modified version **or run a modified version as a network service**, you must release your modifications under the same AGPL-3.0-or-later license.

## Why AGPL

The choice is recorded in [ADR-0006](https://github.com/mikolajmikolajczyk/madside). The short version:

- **Anti-SaaS-fork.** Plain GPL lets someone host a modified fork as a web service without ever releasing the changes (no binary is distributed). AGPL's network clause closes that gap — a hosted fork must publish its modifications too.
- **Anti-distributed-fork.** A fork shipped as a desktop app or rebranded web build must likewise release its changes. That's the ordinary GPL part.
- **A real plugin ecosystem survives.** Plugins may be released under any AGPL-3.0-compatible license — including MIT and Apache-2.0 — so the extension surface stays open.
- **Standard, OSI-approved text.** No custom drafting, no legal landmines; it's the FSF's license, used by many projects.

## Plugins and bundled components

- **Plugins** may carry any AGPL-3.0-compatible license. The plugin manifest's `license` field is informational; the workbench does not enforce a check.
- madside bundles several third-party tools and libraries under their own upstream licenses. The **cc65** toolchain (C compiler + ca65 + ld65) is Zlib; the **MADS** assembler is freeware; the **Altirra** emulator core is GPL-2.0-or-later. Bundled npm libraries include **jsnes** (Apache-2.0), **clang-format** (MIT wrapper / Apache-2.0-WITH-LLVM-exception), **fflate** (MIT), and **idb** (ISC) — all AGPL-3.0-compatible. The full, version-pinned list is in [Third-party software](/docs/reference/third-party/).

## Copyright

madside is a solo project; the author retains full copyright. There is no contributor license agreement today. If the project ever takes external contributions, the policy is inbound = outbound (contributions licensed under AGPL-3.0-or-later).

For the authoritative terms, read the [full AGPL-3.0 text](https://www.gnu.org/licenses/agpl-3.0.html). The two-sentence summary above is a convenience, not a substitute.
