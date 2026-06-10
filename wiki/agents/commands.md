# Common dev commands

## App

```sh
npm run dev          # vite dev server
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist/
npx tsc --noEmit     # typecheck only
```

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
