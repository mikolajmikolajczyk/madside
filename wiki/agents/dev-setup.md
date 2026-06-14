# Dev setup

> Tool choices, not architecture. Each tool here is swappable in roughly a day. See [`../adr/README.md`](../adr/README.md) for why these aren't ADRs.

## Status

- **Nix flake (`d8935a9`)** — ✅ landed. `flake.nix` + `.envrc` at repo root, `nix develop` and `nix develop .#wasm` shells defined.
- **Pre-commit + static analysis (`fa6ff3a`)** — ✅ landed. `.pre-commit-config.yaml` at repo root, hook stack below. Most hooks are `stages: [manual]` during the Foundation baseline-cleanup pass; flip to `pre-commit` stage as each hook's baseline goes green.

## Toolchain: Nix flake (primary) + pnpm fallback

A Nix flake at the repo root pins every dev tool to a known version. `nix develop` lands a working shell. `direnv` auto-activates on `cd`.

- **Primary path:** `nix develop` (or auto via direnv `.envrc`)
- **Fallback path:** Node ≥ 22 plus **pnpm** on the user's PATH, then `pnpm install`. Best-effort, no version guarantees.
- pnpm (not npm) is the package manager — `pnpm-lock.yaml` is the lockfile and the pre-commit hooks call `pnpm exec`. Using plain `npm` breaks the hooks.
- The fallback exists so a casual contributor without Nix can still run `pnpm install && pnpm dev`. If a build genuinely requires Nix, that's a separate decision and would deserve an ADR.

### What lives in the default shell

- Node 22, pnpm, just
- shellcheck (standalone analyzer)
- pre-commit framework
- trivy, gitleaks
- nixfmt, statix, deadnix
- graphviz (`dot`, for `madge --image`)
- git, radicle-node
- gnupg (the UID-guard pre-commit hook needs it)

JS-only tools — typescript, eslint, prettier, knip, madge, markdownlint-cli — are **not** in the Nix shell. They live in `package.json` devDependencies and are provided via `node_modules/.bin` after `pnpm install`; pre-commit invokes them with `pnpm exec`.

### What lives in `nix develop .#wasm` (opt-in)

Heavy toolchain for rebuilding `mads.wasm` and `altirra-core.wasm`. Casual contributors don't need it.

- cmake, gcc, emscripten
- FPC (for the MADS rebuild path)
- sdl3 dev headers

### Pinning policy

- Track a single nixpkgs revision via `flake.lock` (checked in)
- Bumps are deliberate commits — read changelogs, smoke-test, commit
- No casual `nix flake update`

## Auto-activation: direnv

`.envrc` with `use flake` at repo root. `cd madside/` → shell is provisioned. Saves typing `nix develop` every session.

- direnv is **optional**. Without it, `nix develop` works the same.

## Hook orchestration: pre-commit.com framework

A `.pre-commit-config.yaml` at repo root declares the hook stack. Tools come from the Nix devShell; pre-commit invokes them.

### Hook stack

| Hook | What it catches |
|------|-----------------|
| trailing-whitespace, end-of-file-fixer, check-merge-conflict, check-yaml, check-json, check-added-large-files | File hygiene (8 MB cap leaves room for committed wasm cores) |
| prettier (`pnpm exec prettier --check`) | TS/TSX/JS/CSS/MD/JSON/YAML formatting |
| eslint (`pnpm exec eslint`; typescript-eslint, eslint-plugin-boundaries) | Layering violations, lint errors, type-aware checks |
| typecheck (`pnpm exec tsc -b`) | Type errors across project references |
| knip (`pnpm exec knip`) | Dead exports, unused deps, unused files |
| madge `--circular` (`pnpm exec madge`) | Circular dependencies |
| markdownlint (`pnpm exec markdownlint`) | Wiki + AGENTS / CLAUDE / README hygiene |
| shellcheck | Bash scripts (hooks, justfile snippets) |
| nixfmt, statix, deadnix | Nix files |
| gitleaks | Secret detection |
| trivy `fs --scanners vuln,secret,misconfig` | Dep CVEs + leaked secrets + misconfigured yaml/Dockerfile |
| **local hook: gpg-uid-guard** (`scripts/uid-guard.sh`) | Refuse to sign when `user.email` has no matching UID on the signing key |

### Lifecycle

- `pre-commit install` once per fresh checkout (or auto via `init.templateDir` if matching the global template).
- Heavy hooks (`trivy`) can move to `pre-push` stage if they make `commit` feel slow.
- Initial rollout pins everything as `stages: [manual]` so we don't block work until baseline is clean. Flip to `pre-commit` stage after the cleanup pass.

## Editor

No mandate. Recommended (because of the existing TS / CodeMirror / Vite stack):

- VS Code with ESLint + Prettier extensions
- Cursor (same extensions)
- Helix or Neovim with `typescript-language-server`

The `.vscode/` directory holds shared settings if/when added. No personal configs there.

## UID-guard hook

- The **UID-guard** script is checked into the repo at `scripts/uid-guard.sh` and wired via `.pre-commit-config.yaml` as a `local` hook (`id: gpg-uid-guard`, `always_run: true`). Self-contained — no home-manager or external template needed.
- It refuses to sign when `user.email` has no matching UID on the configured GPG signing key. Runs on every commit because its baseline already passes.

## How to swap a tool

Each entry above is swappable. Examples:

- Swap pre-commit framework for `husky` / `lefthook`: rewrite `.pre-commit-config.yaml` into the new tool's format, update this page, update the install command in [`commands.md`](commands.md).
- Drop trivy, keep gitleaks: remove the trivy hook entry, update this page.
- Skip Nix entirely: delete `flake.nix` + `.envrc`, update the "fallback" section to be the only path.

No ADR is required for any of these — just update this page and the relevant config file.

## Related

- [`commands.md`](commands.md) — the actual `nix develop` / `pre-commit run` invocations
- [`../adr/README.md`](../adr/README.md) — when to write an ADR vs when to update this page
- Radicle issues `d8935a9` (Nix flake) and `fa6ff3a` (pre-commit + static analysis) — implementation tracking
