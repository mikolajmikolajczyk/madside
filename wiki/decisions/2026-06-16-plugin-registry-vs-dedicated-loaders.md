# PluginRegistry vs dedicated converter/editor loaders

**Date:** 2026-06-16
**Status:** accepted
**Context:** issue #23 ("two live plugin systems"). The `PluginRegistry` held built-in editors as panels (via `editorToPanel`) AND a legacy `buildEditorRegistry`/`buildRegistry` loaded the same modules — apparent duplication. The original intent was to fold converters + editors into the unified `PluginRegistry` and delete the legacy registries ("finish the PanelSlot swap").

## Decision

**Keep two mechanisms, by design — they model two different plugin lifecycles.**

- **`PluginRegistry`** holds **built-in singletons**: machine, toolchain, emulator, debug-adapter, panel. One instance each, registered at boot, resolved by `(kind, id)`. A static `id → plugin` map fits perfectly.

- **Converters + editors** are **project-local, per-file, content-addressed JS modules**: loaded on demand from `converters/*.js` / `editors/*.js` via Blob URL + dynamic import, cached by content hash, resolved by **file extension**, and rebuilt whenever the project's files change. Their dedicated builders (`buildRegistry`, `buildEditorRegistry` in `@plugins/converters` / `@plugins/editors`) model this naturally.

Forcing the latter into the `PluginRegistry` would mean dynamic register/unregister on every project-file edit, content-hash invalidation, and ext-resolution bolted onto a static map — complexity for the sake of "one registry." The dedicated loaders are clean (the loader is DI-injected after #25, ADR-0002-correct) and lifecycle-appropriate.

## What changed

Removed the **dead scaffolding** that created the false duplication: `createWorkbench` no longer registers built-in editors as panels (`editorToPanel`), and `editorToPanel`/`asPanel.ts` are deleted — nothing rendered those panels (the live editor path is `usePluginEditor` → `buildEditorRegistry` → `PluginEditor`; `fileExt` was never read off the registry).

## Consequences

- One mechanism per lifecycle: registry for singletons, dedicated loaders for project-local per-file plugins. No duplicate loading.
- If file editing ever needs to flow through `PanelSlot`, that's a forward feature (dynamic project-plugin registration) — not a prerequisite for removing the duplication, which this resolves now.
