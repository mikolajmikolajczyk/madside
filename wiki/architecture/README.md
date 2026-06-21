# wiki/architecture

Diagrams + structural snapshots. Generated, not hand-edited — regenerate after
non-trivial refactors so the wiki keeps tracking reality.

## Files

| File | What | Regenerate with |
|------|------|-----------------|
| [`dep-graph.svg`](dep-graph.svg) | Module-level dependency graph for the workspace (`packages/` + `apps/ide/src/`). Useful for spotting layer violations before lint catches them, and for finding clusters that are good extraction candidates. | `pnpm graph` (uses madge + graphviz) |

## Circular dependency policy

Zero cycles across the workspace (`packages/` + `apps/ide/src/`). Enforced by:

- `pnpm graph:circular` (manual)
- `madge --circular` pre-commit hook (runs every commit)

If a cycle slips in, fix at the import level — usually by lifting a shared type into `@ports` or splitting a multi-purpose file. Don't break the cycle with `import type` tricks; those hide the design problem instead of solving it.

## When to regenerate

- After a folder reorg (e.g. ADR-0002 layering work).
- After bringing a new layer or sub-folder online.
- Before opening a milestone-cap PR — gives the next milestone a clean baseline to compare against.

Not needed for routine code changes; the graph rarely changes meaningfully between small patches.
