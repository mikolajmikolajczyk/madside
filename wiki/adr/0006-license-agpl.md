# ADR-0006: License — AGPL-3.0-or-later

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Mikołaj
- **Tags:** legal, foundation, plugins

## Context

Madside is open-source-aspiring and plugin-extensible (ADR-0001). Until now it has shipped with no `LICENSE` file, which means "all rights reserved by default" — legally ambiguous for contributors, plugin authors, and forkers. Both Altirra (the wasm core, GPL-3) and MADS (the bundled assembler, MIT-equivalent) ship under permissive enough terms to allow either copyleft or permissive output licensing. The license choice for madside itself is open.

The concrete concern: someone forks madside, adds a few proprietary features (cloud sync, account system, paid editor plugins) and resells it to hobbyists without contributing back. The author wants to be the sole entity in a position to commercialise the work, while keeping the door open to a real plugin ecosystem.

## Decision drivers

- **Anti-SaaS-fork.** A fork that hosts madside-as-a-service must release modifications. This is the AGPL trigger.
- **Anti-distributed-fork.** A fork that ships modified madside as a desktop app or rebranded web build must also release modifications. This is the GPL part of AGPL.
- **Plugin ecosystem must survive.** Plugin authors should be able to write plugins under any GPL-compatible licence and distribute them freely.
- **Author retains all copyright.** Sole author today; preserves the option to dual-license commercially in the future without coordinating with contributors.
- **Standard text, no custom drafting.** Avoid legal landmines from rolling our own.
- **OSI-approved.** Stays inside the open-source mainstream, avoids tooling and distribution friction (linters, distro packaging, "no non-OSI" corporate policies).

## Considered options

1. **MIT / Apache-2.0** — permissive. Anyone can fork and resell, no source disclosure. Rejected: directly contradicts the anti-fork-commercialisation goal.
2. **GPL-3.0** — copyleft for distributed binaries, but a SaaS fork (no binary distribution, only network access) sidesteps the disclosure requirement. Rejected: leaves the SaaS escape hatch open.
3. **AGPL-3.0-or-later (chosen)** — copyleft + network clause. Any fork, whether distributed or hosted as a service, must release modifications. OSI-approved, standard text.
4. **BUSL / FSL** — source-available with time-limited commercial restriction. Rejected: not OSI, plugin ecosystem suffers, and the "delayed open source" complexity isn't justified for a solo project.
5. **PolyForm Noncommercial 1.0.0** — explicit no-commercial-use, standard text, not OSI. Rejected: blocks even internal corporate use that has no real impact on the author, and damages the plugin ecosystem more than the perceived risk warrants.
6. **Custom AGPL + Non-Commercial** — user-proposed combination. Rejected: not OSI, no standard text (legal landmine), conflicts with the GPL-3 Altirra wasm core's terms by adding a field-of-use restriction.
7. **Dual licence (AGPL + commercial) from day one** — Rejected as a starting position. Adds CLA friction with no current commercial demand. Easy to add later because the author holds full copyright.

## Decision outcome

Adopt **GNU Affero General Public License version 3.0 or later** for the madside codebase. The full licence text lives in `LICENSE` at the repo root.

### What this means

- Forks of madside (whether distributed as binaries or hosted as a service) must release their modifications under AGPL-3.0-or-later.
- Plugin authors may publish plugins under any AGPL-compatible licence (GPL family, LGPL, MIT, Apache-2.0 — Apache-2.0 specifically per FSF GPL-3 / Apache-2 compatibility ruling).
- The author retains all copyright, which preserves the option to dual-licence commercially in the future without consulting contributors.
- Users may use madside internally (no distribution, no network service exposure) without source-disclosure obligation. The realistic risk of a corporation using madside "internally" to build commercial products is low for a retro 8-bit IDE.

### Per-file headers

Not required at v1. The repo-root `LICENSE` plus a `license` field in `package.json` is sufficient under AGPL-3 §10 (licence applies to the work as a whole). If contributors join and per-file copyright tracking becomes valuable, the SPDX header convention (`// SPDX-License-Identifier: AGPL-3.0-or-later`) can be added in a single mechanical pass — no licensing implications.

### Plugin licensing

The plugin contract documentation (lands M7) will note: "plugins may be released under any AGPL-3.0-compatible licence. The plugin manifest's `license` field is informational; the workbench does not enforce any check." Specifically, MIT and Apache-2.0 plugins remain fine — both are AGPL-3-compatible when distributed alongside an AGPL host.

### Vendored skill copies + Altirra fork

The `wiki/skills/radicle.md` and `wiki/skills/radboard.md` files are vendored from external sources (canonical upstreams listed in `wiki/skills/index.md`). They retain their upstream licences and are clearly marked as such; this ADR does not change their licensing.

The `_notes/altirra/` fork is a separate repo (not part of madside's git tree) and remains under its upstream GPL-3 licence.

### Contributor agreement

No CLA required today. Solo project, all copyright author-held. If the project ever takes external contributions, the policy will be **inbound = outbound** (contributions are licensed under AGPL-3.0-or-later to the author) per the common open-source default. If a dual-licence offering ever materialises, the author will introduce a DCO (Developer Certificate of Origin) sign-off at that point — not before.

### Header banner in source files

Not added. A `LICENSE` file at the repo root and the `package.json` `license` field are sufficient. Adding a `// SPDX-License-Identifier:` line to every TS file is fine but not mandatory; deferred unless contributors specifically request it.

## Positive consequences

- Anti-SaaS-fork goal achieved by standard, well-understood, OSI-approved licence.
- Plugin ecosystem stays inside the mainstream open-source compatibility matrix.
- Author retains full copyright, can dual-licence later without coordination.
- No legal drafting required — FSF text, used by hundreds of projects.
- Clear stance for contributors and users from day one.

## Negative consequences

- Some corporations have blanket "no AGPL" policies. Their employees may not be able to use madside at work without an exemption — acceptable, since the alternative is making the licence permissive enough to be commercially exploited.
- AGPL's network-clause obligations can surprise users who haven't read the licence. Mitigation: the README section explains the spirit of the licence in two sentences, link to full text.
- Future commercial dual-licence work requires either author-only commits or DCO sign-offs on contributor patches. Tracked as a follow-up only if commercial demand emerges.

## Open questions

- **Whether to require DCO sign-off on patches today** — deferred. Adds friction with no current value. Revisit when first external contributor appears.
- **Whether to add a `NOTICE` file** — AGPL doesn't require one. Apache-2 deps may. Audit when M3-services lands and the dependency tree consolidates.

## Links

- Foundation epic: `b1236bb`
- This issue: `23ccdfc`
- ADR-0001 — Plugin-based retro-development workbench (defines the plugin-ecosystem ambition this licence has to coexist with)
- AGPL-3.0 full text: [`../../LICENSE`](../../LICENSE)
- FSF AGPL FAQ: <https://www.gnu.org/licenses/why-affero-gpl.html>
