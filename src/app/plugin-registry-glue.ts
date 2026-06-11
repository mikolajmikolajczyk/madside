// @ui needs the buildRegistry/buildEditorRegistry helpers but cannot import
// directly from @plugins (ADR-0002). The @app layer re-exports them so the
// UI layer reaches plugin internals through one supervised entry point.
// PluginRegistry workbench-side integration replaces this in M7.

export {
  buildRegistry as buildConverterRegistry,
  type ProjectConverterSource,
  isBuiltin as isBuiltinConverter,
  listBuiltins as listBuiltinConverters,
} from "@plugins/converters";

export {
  buildEditorRegistry,
  resolveEditorId,
  type ProjectEditorSource,
  listBuiltinEditors,
} from "@plugins/editors";
