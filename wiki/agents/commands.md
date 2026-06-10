# Common dev commands

## Shell

```sh
nix develop          # default dev shell — node, pnpm, just, lint stack, security scanners
nix develop .#wasm   # heavy: adds cmake, emscripten, fpc for wasm rebuilds
# direnv users: just `cd` into the repo — .envrc activates the default shell automatically
```

Fallback path (no Nix): use any Node ≥ 22 + pnpm ≥ 10 on your PATH and skip `nix develop`.

## App

```sh
pnpm dev             # vite dev server
pnpm build           # tsc -b && vite build → dist/
pnpm preview         # serve dist/
pnpm tsc --noEmit    # typecheck only
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
just build-mads-wasm        # rebuild public/wasm/mads.wasm
just build-altirra-wasm     # rebuild public/altirra/altirra-core.{wasm,js}
```

Details: [`mads-wasm-build.md`](mads-wasm-build.md), [`altirra-wasm-build.md`](altirra-wasm-build.md). **Do not rebuild casually.** Bump pinned commits in `justfile` deliberately, rerun, smoke-test, commit the new artifact.

## Radicle (issues, patches)

```sh
rad issue list                   # open issues
rad issue list --all             # everything
rad issue show <ID>              # full issue body
rad patch list                   # open patches
rad sync                         # fetch + announce
```

Full reference: [`../skills/radicle.md`](../skills/radicle.md). Label conventions: [`../skills/radboard.md`](../skills/radboard.md).

## Git

Standard. Conventional Commits. GPG-signed. **Never commit without explicit user request.**

## Tests

To land in Foundation. When wired:

```sh
pnpm test            # vitest run
pnpm test:watch      # vitest watch
```
