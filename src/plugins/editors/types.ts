// Public API shared by reference editors and project-local `editors/*.js`.
//
// A plugin editor owns a host-provided <div> and renders whatever it likes
// (canvas, DOM, even its own framework). It receives the file's current bytes
// + an `onChange` callback, plus read-only access to the rest of the project's
// assets. It must clean up on `destroy()`.

export interface EditorMeta {
  id: string;
  label: string;
  fileExt: string[];          // extensions this editor handles (no dot, lowercase)
}

export interface EditorAsset {
  path: string;
  bytes: Uint8Array;
}

export interface EditorContext {
  /** Current file bytes. */
  value: Uint8Array;
  /** Path of the file being edited (read-only; for display only). */
  path: string;
  /** Persist a new value to the project. Debouncing is the plugin's responsibility. */
  onChange: (bytes: Uint8Array) => void;
  /** Other project files (read-only snapshot at mount time). */
  assets: EditorAsset[];
}

export interface EditorHandle {
  /** Called when the plugin is unmounted. Free timers, observers, etc. */
  destroy(): void;
  /** Optional: host pushes a new value when the file changes externally
   *  (e.g. snapshot restore). If absent, the host remounts. */
  onValueChange?: (bytes: Uint8Array) => void;
}

export type EditorMount = (container: HTMLElement, ctx: EditorContext) => EditorHandle;

export interface EditorModule {
  meta: EditorMeta;
  mount: EditorMount;
}
