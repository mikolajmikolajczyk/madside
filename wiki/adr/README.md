# When to write an ADR

ADRs are append-only records of decisions that are **expensive to reverse**, **constrain future choices**, or **need explaining a year from now**. They are not a journal of every change. The bar for adding one is deliberately high so the index stays scannable.

## The three-way split

Madside captures decisions in three places. Pick the right one:

| Surface | Use when | Lifetime |
|---------|----------|----------|
| **ADR** (this folder) | Decision constrains app shape, plugin contracts, layering, error/test/runtime semantics. Hard to reverse. Affects every future contributor and plugin author. | Project-lifetime, append-only |
| **Decision log** ([`../decisions/`](../decisions/)) | Cross-cutting tool / library / process choice not tied to a single issue. Reversible in days. Examples: which EventBus library, whether wasm artifacts get rebuilt in CI, AI-agent permissions. | Until superseded; lightweight |
| **Issue comment / commit message** | Decision tied to one issue or one commit. Examples: "for `c5aaf5a` we encode F-keys via POKEY high-range KBCODE not console keys." | Bound to that issue / commit |

If a decision spans more than the immediate work but isn't an architectural promise, it belongs in `../decisions/` — not as a fourth ADR. ADR overhead (full template, ceremony, numbered slot, append-only discipline) is wasted on a library swap.

## Write an ADR when the decision

- **Constrains the shape of the app or plugin contracts** — once shipped, plugin authors and downstream code depend on it.
- **Is hard to reverse** — undoing it requires a migration, not a refactor.
- **Affects cross-cutting concerns** — touches multiple layers / modules / milestones.
- **Was contested or non-obvious** — there were real alternatives and someone, future-you included, will want the rationale.
- **Has stakeholder implications** — onboarding, distribution, licensing, hosting.

## Skip the ADR when the decision

- Is a **tool choice** that can be swapped in a day (formatter, linter, package manager, devShell tech).
- Is **DX convenience** with no behavioral effect (editor config, direnv, shell aliases).
- Is a **library swap** in a single layer with no contract change.
- Belongs in a **PR description, commit message, or code comment** because it only affects that change.
- Is **a status update or roadmap item** — those live in GitHub issues, not ADRs.

## Concrete examples for madside

### ADR-worthy

| Topic | Why |
|-------|-----|
| Layering rules + dependency direction | Constrains every future import; load-bearing |
| Plugin host model (main thread vs worker) | Locks plugin transport contract |
| Error boundary strategy | Cross-cutting; defines failure contract per layer |
| Testing strategy (contract harnesses) | Shapes what plugin authors ship alongside plugins |
| `project.json` schema v2 | External contract; hard cut, no shim |
| Machine plugin interface shape | Plugin authors depend on it |
| Monorepo split timing | Cross-cutting; affects build, packaging, publishing |

### NOT ADR-worthy

| Topic | Where it lives instead |
|-------|------------------------|
| Nix flake devShell | [`../agents/dev-setup.md`](../agents/dev-setup.md) |
| Direnv `.envrc` | [`../agents/dev-setup.md`](../agents/dev-setup.md) |
| Pre-commit framework + static analysis tool list | [`../agents/dev-setup.md`](../agents/dev-setup.md) and the in-repo `.pre-commit-config.yaml` |
| Prettier / ESLint / formatter choice | `.eslintrc` / `prettier.config.js` + dev-setup page |
| Editor recommendations | dev-setup page |
| Choice of `mitt` vs `nanoevents` for EventBus | PR description + code comment; library swap |
| Bumping a wasm pin | Commit message + `justfile` diff |
| Adding a new converter to the built-in pack | Commit message + GitHub issue |

### Edge cases — write an ADR if the answer is "yes"

- **Tool choice with lock-in:** "Build *requires* Nix" → ADR. "Nix is primary, npm works as fallback" → no ADR.
- **Library swap that changes a public interface:** if downstream plugins notice the change → ADR. If purely internal → no ADR.
- **Process / workflow decision** (e.g. "PRs target `main`, CI is the merge gate") → ADR if it's a durable contract with collaborators; skip if it's a personal preference.

## Format

Use the existing ADRs in this directory as the template. Minimum sections:

- **Status** — Proposed / Accepted / Superseded by ADR-NNNN
- **Date** — ISO date of acceptance
- **Deciders** — usually `Mikołaj` (solo)
- **Tags** — short labels for searchability
- **Context** — what's the situation
- **Decision drivers** — what matters in the call
- **Considered options** — alternatives, briefly
- **Decision outcome** — what we picked + why
- **Positive / Negative consequences**
- **Links** — issues, prior art, related ADRs

Keep ADRs short. The point is a durable trace, not a research paper. If it grows past ~250 lines, split or scope down.

## Append-only discipline

**Triggered by first public release.** Until v1.0.0 ships and the app has external users, the project is in R&D — ADR substance can be edited in place when the underlying decision changes. We capture the move in a decision-log entry under [`../decisions/`](../decisions/) and update affected ADRs to match reality, so a reader of the wiki never sees a stale plan.

After the first release:

1. Do **not** edit substance. Write a new ADR that supersedes the old one.
2. Update the old ADR's Status line to `Superseded by ADR-NNNN`.
3. Add a back-link to the new ADR.

Editing typos and formatting is always fine.
