# Contributing to madside

Thanks for your interest! madside is an in-browser IDE for retro hardware. This guide covers the dev setup, the PR flow, and where to look when adding new capabilities.

By participating you agree to keep things friendly and respectful — assume good faith, be constructive, no harassment.

## Dev setup

Requires **Node 22** + **[pnpm](https://pnpm.io) 11**. A [Nix](https://nixos.org) flake provisions the full toolchain (and the static-analysis stack):

```sh
nix develop          # or `direnv allow` if you use direnv
# …or just have Node 22 + pnpm on your PATH
pnpm install
pnpm dev             # vite dev server
```

Useful commands:

| Command | What |
|---------|------|
| `pnpm dev` | Vite dev server |
| `pnpm build` | `tsc -b && vite build` (typecheck + production build) |
| `pnpm exec vitest run` | run the test suite |
| `pnpm run lint` | ESLint |
| `pnpm --dir docs dev` | the Astro docs site |

The repo ships an optional [pre-commit](https://pre-commit.com) config (`.pre-commit-config.yaml`) running the same gates as CI (typecheck, eslint, `madge --circular`). It's not required — **CI is the gate** — but it catches issues early: `pre-commit install`.

## Making a change

1. **Branch** off `main` (or fork). One topic per PR.
2. Keep it green: `pnpm build && pnpm exec vitest run && pnpm run lint` all pass.
3. **Commits** follow [Conventional Commits](https://www.conventionalcommits.org) — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc. Scope optional, e.g. `fix(run): …`.
4. Open a **pull request** to `main`. CI (typecheck · test · lint · build + docs build) must pass. Fill in the PR template.
5. Keep the change focused — a bug fix is a bug fix, not surrounding cleanup. Don't add abstractions beyond what the task needs.

GPG-signed commits are appreciated but not required for contributors.

## Where things live

| Need | Where |
|------|-------|
| User + plugin-author docs (public) | [docs site](https://madside.mikolajczyk.org/docs/) · `docs/src/content/docs/` |
| Architecture, conventions, status, ADRs (internal) | [`wiki/`](wiki/) |
| Repo-specific notes for contributors (human + AI) | [`AGENTS.md`](AGENTS.md) |
| Coding conventions + TypeScript rules | [`wiki/agents/conventions.md`](wiki/agents/conventions.md) |
| Current as-built layout + data flow | [`wiki/agents/architecture.md`](wiki/agents/architecture.md) |

## Adding a capability

madside is plugin-based — most additions don't touch the workbench core. Start from the **[Extending guide](https://madside.mikolajczyk.org/docs/extending/)**:

- **[Machine](https://madside.mikolajczyk.org/docs/extending/machine/)** / **[Toolchain](https://madside.mikolajczyk.org/docs/extending/toolchain/)** / **[Emulator](https://madside.mikolajczyk.org/docs/extending/emulator/)** / **[Debug adapter](https://madside.mikolajczyk.org/docs/extending/debug-adapter/)** / **[Panel](https://madside.mikolajczyk.org/docs/extending/panel/)** / **[Converter](https://madside.mikolajczyk.org/docs/extending/converter/)** / **[Editor](https://madside.mikolajczyk.org/docs/extending/editor/)** plugins.
- **[Templates](https://madside.mikolajczyk.org/docs/extending/templates/)** and **[courses](https://madside.mikolajczyk.org/docs/extending/courses/)** are just content directories — and a course can live in your own public GitHub repo, no PR needed.
- Validate a plugin against its **[contract test harness](https://madside.mikolajczyk.org/docs/extending/validating/)**.

## Reporting bugs / proposing features

Open a [GitHub issue](https://github.com/mikolajmikolajczyk/madside/issues) using the templates. For bugs, include the machine (Atari / NES), what you did, and what you expected. Since projects live in your browser, a ZIP export (**File → Export ZIP**) of a minimal repro helps a lot.

## License

By contributing you agree your contributions are licensed under [AGPL-3.0-or-later](LICENSE), the project's license.
