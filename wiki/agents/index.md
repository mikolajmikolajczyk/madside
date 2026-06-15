# wiki/agents — machine-facing docs

Load on demand. Pick the file that matches the task.

| File | When to read |
|------|--------------|
| [architecture.md](architecture.md) | Need to know current repo shape, data flow, or component ownership |
| [conventions.md](conventions.md) | About to write or edit code — TypeScript / CSS / file-naming / comment rules |
| [status.md](status.md) | Want to know what works today vs what's in flight |
| [commands.md](commands.md) | Forgot the dev command |
| [dev-setup.md](dev-setup.md) | Setting up local dev env: Nix flake, direnv, pre-commit, static analysis stack |
| [working-on-issues.md](working-on-issues.md) | Issue lifecycle, branch naming, patch flow, session handoff |
| [glossary.md](glossary.md) | Encountered an Atari or plugin term you don't recognize |
| [mads-wasm-build.md](mads-wasm-build.md) | About to rebuild `mads.wasm` |
| [altirra-wasm-build.md](altirra-wasm-build.md) | About to rebuild Altirra core |
| [deferred.md](deferred.md) | Tempted to implement something not asked — check this first |

Roadmap and active issues are in **GitHub**, not in these files. Use `gh issue list --state all` (repo `mikolajmikolajczyk/madside`).
