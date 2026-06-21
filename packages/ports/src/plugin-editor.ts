// File-editor plugin contract (Phase 11). Lifted into @ports during the
// PluginRegistry unification work so @ui hooks can import the type without
// crossing into @plugins. Shape mirrors the existing @plugins/editors/types
// so vendored editors keep compiling.

export interface EditorMeta {
  id: string
  label: string
  /** Extensions (no dot, lowercase) this editor handles. */
  fileExt: string[]
}

export interface EditorAsset {
  path: string
  bytes: Uint8Array
}

export interface EditorContext {
  /** Current file bytes. */
  value: Uint8Array
  /** Path of the file being edited (read-only; for display only). */
  path: string
  /** Persist a new value to the project. Debouncing is the plugin's responsibility. */
  onChange: (bytes: Uint8Array) => void
  /** Other project files (read-only snapshot at mount time). */
  assets: EditorAsset[]
}

export interface EditorHandle {
  /** Called when the plugin is unmounted. Free timers, observers, etc. */
  destroy(): void
  /** Optional: host pushes a new value when the file changes externally
   *  (e.g. snapshot restore). If absent, the host remounts. */
  onValueChange?: (bytes: Uint8Array) => void
}

export type EditorMount = (container: HTMLElement, ctx: EditorContext) => EditorHandle

export interface EditorModule {
  meta: EditorMeta
  mount: EditorMount
}
