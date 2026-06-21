// @ui needs the converter/editor registry builders but cannot import directly
// from @plugins (ADR-0002). The @app layer re-exports them so the UI layer
// reaches plugin internals through one supervised entry point.
//
// These are NOT folded into the PluginRegistry by design: converters/editors
// are project-local, per-file, content-addressed JS modules with a lifecycle
// distinct from the built-in singletons the registry holds. See
// wiki/decisions/2026-06-16-plugin-registry-vs-dedicated-loaders.md.

export {
  buildRegistry as buildConverterRegistry,
  type ProjectConverterSource,
  isBuiltin as isBuiltinConverter,
  listBuiltins as listBuiltinConverters,
} from "@madside/converters";

export {
  buildEditorRegistry,
  resolveEditorId,
  type ProjectEditorSource,
} from "@madside/editors";
