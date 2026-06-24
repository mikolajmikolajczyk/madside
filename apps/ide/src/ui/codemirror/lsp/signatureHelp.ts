import { ViewPlugin, EditorView, showTooltip, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { cSignatureHelp, type SignatureInfo } from "./client";

// Signature help (#71). While the cursor sits inside a call's `(…)`, a tooltip
// shows the function signature with the active parameter bold. The server
// decides whether the cursor is in a call (returns null otherwise), so the
// host just re-requests on cursor / edit and shows whatever comes back.

const setSig = StateEffect.define<Tooltip | null>();

const sigField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSig)) return e.value;
    // Keep the popup pinned to its anchor across edits until the next request
    // resolves, so it doesn't jump while typing an argument.
    if (value && tr.docChanged) return { ...value, pos: tr.changes.mapPos(value.pos) };
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

/** Render the signature text, bolding the active parameter by locating its
 *  label substring (the server sends parameter labels as text). */
function renderSignature(info: SignatureInfo): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-c-sighelp";
  const active = info.params[info.active];
  const at = active ? info.label.indexOf(active) : -1;
  if (active && at >= 0) {
    dom.append(document.createTextNode(info.label.slice(0, at)));
    const strong = document.createElement("strong");
    strong.textContent = active;
    dom.append(strong, document.createTextNode(info.label.slice(at + active.length)));
  } else {
    dom.textContent = info.label;
  }
  return dom;
}

const plugin = ViewPlugin.fromClass(
  class {
    private timer: number | undefined;
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.schedule(u.view);
    }
    private schedule(view: EditorView) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const pos = view.state.selection.main.head;
        void cSignatureHelp(view.state.doc, pos).then((info) => {
          const tip: Tooltip | null = info
            ? { pos, above: true, create: () => ({ dom: renderSignature(info) }) }
            : null;
          view.dispatch({ effects: setSig.of(tip) });
        });
      }, 120);
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

/** CodeMirror extension: cursor-driven cc65 signature help. Degrades silently
 *  to no popup on transport failure. */
export function cSignatureHelpTooltip(): Extension {
  return [sigField, plugin];
}
