# Common dev commands

## Shell

```sh
nix develop          # default dev shell — node, pnpm, just, security scanners
nix develop .#wasm   # heavy: adds cmake, emscripten, fpc for wasm rebuilds
# direnv users: just `cd` into the repo — .envrc activates the default shell automatically
```

The devShell provides `nodejs_22` + `pnpm` (not npm). JS-only tools (eslint, prettier, tsc, knip, madge, markdownlint) come from `node_modules/.bin` after `pnpm install`.

Fallback path (no Nix): Node ≥ 22 plus **pnpm** on your PATH, then `pnpm install`. pnpm is required, not optional — the pre-commit hooks invoke `pnpm exec`, so plain `npm` breaks them.

## App

```sh
pnpm dev                # vite dev server
pnpm build              # tsc -b && vite build → dist/
pnpm preview            # serve dist/
pnpm typecheck          # tsc -b — incremental project references
```

## Dep graph

```sh
pnpm graph             # writes wiki/architecture/dep-graph.svg
pnpm graph:circular    # exits non-zero if any cycle exists
```

## Lint / static analysis

```sh
pre-commit install                              # one-time per clone
pre-commit run --all-files                      # default-stage hooks only (cheap, every commit)
pre-commit run --all-files --hook-stage manual  # full suite — prettier, eslint, knip, madge, markdownlint, shellcheck, nixfmt, trivy, gitleaks
pre-commit run <hook-id> --all-files --hook-stage manual   # one specific hook
```

Most hooks are still `stages: [manual]` during the Foundation cleanup pass. They get promoted to `pre-commit` stage as their baseline goes clean.

## Wasm rebuilds (rare, deliberate)

```sh
just build-mads-wasm        # rebuild src/plugins/toolchain-mads/wasm-mads/mads.wasm
just build-altirra-wasm     # rebuild src/adapters/emu/wasm/altirra-core.{wasm,js}
```

The `just` recipes also wrap the app commands above (`just dev`, `just build`, `just preview`, `just typecheck`, `just install`) and the docs site (`just docs-dev`, `just docs-build` — Astro Starlight under `docs/`).

Details: [`mads-wasm-build.md`](mads-wasm-build.md), [`altirra-wasm-build.md`](altirra-wasm-build.md). **Do not rebuild casually.** Bump pinned commits in `justfile` deliberately, rerun, smoke-test, commit the new artifact.

## GitHub (issues, PRs)

```sh
gh issue list                    # open issues
gh issue list --state all        # everything
gh issue view <n> --comments     # full issue body + comments
gh pr list                       # open PRs
gh pr create --base main --fill  # open a PR to main
```

Issue/label and PR workflow: [`working-on-issues.md`](working-on-issues.md). Contribution flow: repo-root [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Git

Standard. Conventional Commits. GPG-signed. **Never commit without explicit user request.**

## Tests

```sh
pnpm exec vitest run   # one-shot
pnpm test              # watch mode (package.json "test" → vitest)
```

Test layout (ADR-0005):

- `src/**/*.test.ts` — pure-logic units alongside source
- `tests/integration/*.test.ts` — headless workbench + memory adapters
- `tests/contract/*.test.ts` — plugin-kind contract harnesses (land per kind)
- Playwright E2E deferred; guardrails tracked in `7659319`.
