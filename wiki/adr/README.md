# When to write an ADR

ADRs are append-only records of decisions that are **expensive to reverse**, **constrain future choices**, or **need explaining a year from now**. They are not a journal of every change. The bar for adding one is deliberately high so the index stays scannable.

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
- Is **a status update or roadmap item** — those live in Radicle issues, not ADRs.

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
| Adding a new converter to the built-in pack | Commit message + radicle issue |

### Edge cases — write an ADR if the answer is "yes"

- **Tool choice with lock-in:** "Build *requires* Nix" → ADR. "Nix is primary, npm works as fallback" → no ADR.
- **Library swap that changes a public interface:** if downstream plugins notice the change → ADR. If purely internal → no ADR.
- **Process / workflow decision** (e.g. "Patches go through Radicle, GitHub mirror is CI-only") → ADR if it's a durable contract with collaborators; skip if it's a personal preference.

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

Once Accepted, do **not** edit substance. To change direction:

1. Write a new ADR that supersedes the old one.
2. Update the old ADR's Status line to `Superseded by ADR-NNNN`.
3. Add a back-link to the new ADR.

Editing typos and formatting is fine. Editing decisions is not.
