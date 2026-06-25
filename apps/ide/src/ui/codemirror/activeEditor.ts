import type { EditorView } from "@codemirror/view";

// The CodeMirror view that currently has focus (#144). The OSK symbol bar is a
// single app-level element floating above the keyboard, not part of any one
// editor, so it needs to know which editor to insert into. Editors register here
// on focus.

let active: EditorView | null = null;

export function setActiveEditor(view: EditorView | null): void {
  active = view;
}

/** Forget `view` if it's the active one (called when an editor is destroyed). */
export function clearActiveEditor(view: EditorView): void {
  if (active === view) active = null;
}

export function getActiveEditor(): EditorView | null {
  // Guard against a stale handle whose DOM was torn down.
  if (active && !active.dom.isConnected) active = null;
  return active;
}
