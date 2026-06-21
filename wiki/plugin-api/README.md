# Plugin API

Contracts every madside plugin kind implements. Source of truth for the type definitions lives in `packages/ports/src/plugin-*.ts`; this folder explains them with rationale + a hello-world per kind so an external author can ship a working plugin without reading the workbench source.

| Kind | Folder | Status | Document |
|------|--------|--------|----------|
| MachinePlugin | `packages/machine-*/src` | v0.4.0 ✅ | [machine.md](machine.md) |
| ToolchainPlugin | `packages/toolchain-*/src` | v0.5.0 ✅ | [toolchain.md](toolchain.md) |
| DebugAdapterPlugin | `packages/debug-*/src` | v0.6.0 ✅ | [debug-adapter.md](debug-adapter.md) |
| PanelPlugin | `packages/panel-*/src` | v0.7.0 ✅ | [panel.md](panel.md) |
| Converter (asset) | `packages/converters/src` + `converters/*.js` | Phase 7 ✅ | [converter.md](converter.md) |
| FileEditor (legacy) | `packages/editors/src` + `editors/*.js` | Phase 11 ✅ → folded into PanelPlugin (cae0633) | [editor.md](editor.md) |
| EmulatorPlugin | `packages/emulator-*/src` | ⏳ M4 follow-up | — |

## Conventions

- **Plugin id**: kebab-case ascii slug. Stable — manifest dispatch uses it.
- **Resolution**: project-local plugin (loaded via Blob URL) shadows the built-in with the same id.
- **Registration**: all plugin kinds go through the unified `PluginRegistry` (`@ports/plugin-registry`). Built-ins register at workbench construction; project-local ones register per project load.
- **Layering** (ADR-0002): plugin code lives in `@plugins`. It may import `@ports` + `@core` only — never `@adapters`, `@services`, `@app`, `@ui`. ESLint enforces.
- **Errors**: plugins throw on failure; the host's error boundary contains the blast radius (ADR-0004 + commit `a6152af` for the PluginEditor case).
- **Testing**: each kind ships an `assert<Kind>Plugin(impl, fixture)` Vitest harness under `@ports/test/` (so far: ToolchainPlugin, commit `51e047c`). External authors drop a one-liner test against their plugin.

## Type-package split (not planned)

Earlier roadmap had plugin contracts move into a `packages/plugin-api/` workspace as part of the M8 monorepo split. **That split was cancelled 2026-06-12** — see [decisions](../decisions/2026-06-12-monorepo-split-cancelled.md). Plugin contracts stay in `@ports/plugin-*.ts`. Third-party authors load via the PluginRegistry Blob URL path (same as project-local converters / editors today); a published types package becomes a follow-up only if real external demand appears.

## User docs

These files are the internal **contract** source of truth (agent-facing). The public, tutorial-style plugin-author docs live in the Astro Starlight site under `docs/` (the "Extending madside" section, epic `de964f7`) and curate from these contracts.
