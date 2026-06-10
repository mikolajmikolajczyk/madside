# Coding conventions

## TypeScript

- Strict mode. No `any` unless absolutely needed — cast through `unknown`.
- React 19 hooks. No Redux/Zustand. `useState` + custom hooks until a real coordination problem appears.

## CSS

- CSS modules-by-convention: each component owns its `.css` file imported by it.
- Design tokens via CSS variables (`tokens.css`), not SCSS. Keeps build stack minimal.
- No Tailwind, no shadcn. Headless Radix primitives + CSS variables.

## UI text

- No emoji in UI text.
- Terse English, lowercase, mono (e.g. `assemble`, `run`, `ready`, `working…`).

## File naming

- Components: PascalCase (`Editor.tsx`).
- Libs: camelCase (`sourceMap.ts`).
- One component per file. Co-located CSS.

## Imports

- Use path aliases (`@core`, `@services`, `@ports`, `@adapters`, `@plugins`, `@ui`) once they land in Foundation. Until then, relative imports.
- Cross-folder imports go through a folder's barrel (`index.ts`), not into its internals.

## Files in MADS virtual FS

- Leaf names only — no paths — **currently**.
- Phase 1 (already done): switched to path-based (`src/main.asm`, `assets/...`, `generated/...`). MADS resolves `icl` from project root via `-i:.`.

## Converters and editors are project data

- Built-in converters in `src/lib/converters/builtins/` are a starter pack.
- The canonical library lives in a separate repo + blog.
- Project-local converters in `converters/*.js` shadow built-ins by `meta.id`.
- Editors follow the same Phase 11 contract (`editors/*.js`).
- Both will move under a unified `PluginRegistry` in M3.

## Plugins (Phase 7 / Phase 11 → unified M3)

- Self-contained ES modules. No shared utility imports. No other project deps.
- Drop a file into `converters/` or `editors/` → it works.
- Copy-pasteable between projects.
- Loaded via Blob URL + dynamic `import()`. No sandbox.

## Comments

- Default: no comment.
- Add only when the *why* is non-obvious: hidden constraint, subtle invariant, workaround for a specific bug, surprising behavior.
- Never explain *what* the code does — names do that.
- Don't reference the current task / fix / PR ("added for X", "handles case from #123") — that belongs in the commit message.

## Tests

- Strategy: contract + headless integration hybrid (Vitest). See [`../testing/`](../testing/) once Foundation lands.
- No coverage targets.
- No React component tests. Manual + planned E2E cover.

## Commits

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `release:`).
- No `Co-Authored-By: Claude` lines.
- GPG-signed.
- **Never commit without explicit user request.**

## Phase / scope discipline

- Don't pre-empt later milestones.
- If a refactor would be cleaner alongside the bug fix but isn't required, defer it (open a Radicle issue instead).
- Don't add error handling, fallbacks, or validation for scenarios that can't happen at the call site. Trust internal code; validate only at system boundaries.

## When in doubt

- Read the relevant ADR in [`../adr/`](../adr/).
- Check Radicle issues for active work: `rad issue list --all`.
- Ask the user. Solo project — they're the only deciding authority.
