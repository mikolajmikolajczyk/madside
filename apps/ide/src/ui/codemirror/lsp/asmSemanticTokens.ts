import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder, type Extension } from "@codemirror/state";
import { SEM_LEGEND } from "@madside/lsp-asm";
import { asmSemanticTokensFull } from "./asm-client";

// Asm LSP semantic-token overlay (#140). The StreamLanguage already colors
// opcodes / directives / registers / numbers / strings / comments syntactically;
// the language server adds the distinction the lexer CAN'T make from the index —
// a label *definition* vs a symbol *reference* vs a macro — so we paint only
// those three on top, reusing the C overlay's classes (cm-st-function / -variable
// / -macro). The other legend kinds fall through to the StreamLanguage.
const CLASS_BY_KIND: Record<string, string> = {
  label: "cm-st-function",
  symbol: "cm-st-variable",
  macro: "cm-st-macro",
};
// Index = legend position (the packed array's tokenType); null = leave to the
// StreamLanguage.
const MARKS: readonly (Decoration | null)[] = SEM_LEGEND.map((kind) => {
  const cls = CLASS_BY_KIND[kind];
  return cls ? Decoration.mark({ class: cls }) : null;
});

const setTokens = StateEffect.define<DecorationSet>();

const tokenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setTokens)) return e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Decode the packed LSP array into a CodeMirror decoration set (document-ordered
 *  quintuples → sorted ranges, exactly what RangeSetBuilder needs). */
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
    if (deltaLine > 0) { line += deltaLine; char = deltaChar; }
    else char += deltaChar;
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
    constructor(view: EditorView) { this.schedule(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.schedule(u.view); }
    private schedule(view: EditorView) {
      clearTimeout(this.timer);
      // Debounced so fast typing doesn't spam the worker; the StreamLanguage
      // highlight covers the gap until tokens land.
      this.timer = window.setTimeout(() => {
        void asmSemanticTokensFull(view.state.doc).then((data) => {
          if (data) view.dispatch({ effects: setTokens.of(decode(data, view)) });
        });
      }, 200);
    }
    destroy() { clearTimeout(this.timer); }
  },
);

/** CodeMirror extension: paint the asm LSP's label/symbol/macro semantic roles
 *  over the active buffer. Degrades silently to no overlay on transport failure. */
export function asmSemanticTokens(): Extension {
  return [tokenField, plugin];
}
