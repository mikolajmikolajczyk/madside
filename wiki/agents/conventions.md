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
- ESLint enforces this via `import/no-internal-modules` — depth ≥ 2 alias paths (`@adapters/storage-idb/project`) are blocked; use the barrel (`@adapters/storage-idb`) instead. Relative imports within a folder (`./sibling`) stay free.
- Every folder that is a destination for cross-folder imports has an `index.ts`. Add one for any new folder before code in it gets imported elsewhere.

## Files in MADS virtual FS

- Leaf names only — no paths — **currently**.
- Phase 1 (already done): switched to path-based (`src/main.asm`, `assets/...`, `generated/...`). MADS resolves `icl` from project root via `-i:.`.

## Converters and editors are project data

- Built-in converters in `src/lib/converters/builtins/` are a starter pack.
- The canonical library lives in a separate repo + blog.
- Project-local converters in `converters/*.js` shadow built-ins by `meta.id`.
- Editors follow the same Phase 11 contract (`editors/*.js`).
- Both registered through the unified `PluginRegistry` (`@services/plugin-registry`, M3 shipped).

## Plugins (Phase 7 / Phase 11 → unified PluginRegistry)

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
