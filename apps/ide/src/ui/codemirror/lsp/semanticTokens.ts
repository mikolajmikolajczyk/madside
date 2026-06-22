import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, type Extension } from "@codemirror/state";
import { cc65SemanticTokensFull } from "./client";

// LSP semantic-token overlay (#72). The C language server resolves each
// identifier to a *semantic* role the lezer lexer can't see — a macro vs a
// variable, a type vs a function, a struct field — and we paint those spans on
// top of the syntactic highlight. Token-type order matches the server legend.
const TOKEN_TYPES = ["type", "function", "macro", "parameter", "property", "variable"] as const;
const MARKS: readonly Decoration[] = TOKEN_TYPES.map((t) => Decoration.mark({ class: `cm-st-${t}` }));

const setTokens = StateEffect.define<DecorationSet>();

const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Map through edits so spans stay put until the next server response lands.
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setTokens)) return e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Decode the packed LSP array into a CodeMirror decoration set. The quintuples
 *  are document-ordered (deltas only move forward), so the ranges arrive sorted
 *  — exactly what RangeSetBuilder needs. */
function decode(data: number[], view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  let line = 0;
  let char = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i]!;
    const deltaChar = data[i + 1]!;
    const len = data[i + 2]!;
    const type = data[i + 3]!;
    if (deltaLine > 0) {
      line += deltaLine;
      char = deltaChar;
    } else {
      char += deltaChar;
    }
    const mark = MARKS[type];
    if (!mark || len <= 0 || line < 0 || line >= doc.lines) continue;
    const lineObj = doc.line(line + 1);
    const from = Math.min(lineObj.from + char, lineObj.to);
    const to = Math.min(from + len, lineObj.to);
    if (to > from) builder.add(from, to, mark);
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    private timer: number | undefined;
    constructor(view: EditorView) {
      this.schedule(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.schedule(u.view);
    }
    private schedule(view: EditorView) {
      clearTimeout(this.timer);
      // Debounced so fast typing doesn't spam the worker; the syntactic
      // highlight covers the gap until tokens land.
      this.timer = window.setTimeout(() => {
        void cc65SemanticTokensFull(view.state.doc).then((data) => {
          if (data) view.dispatch({ effects: setTokens.of(decode(data, view)) });
        });
      }, 200);
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

/** CodeMirror extension: paint LSP semantic tokens over the active C
 *  buffer. Degrades silently to no overlay on transport failure. */
export function cc65SemanticTokens(): Extension {
  return [tokenField, plugin];
}
