import type { Extension } from "@codemirror/state";
import type { LanguageSupport } from "@codemirror/language";
import { hoverTooltip } from "@codemirror/view";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { ToolchainCSymbol } from "@ports";

// Autocomplete + hover for a toolchain's C library symbols (cc65 conio/stdlib,
// #48). Attaches a completion source to the C language's data so the editor's
// existing autocompletion merges it with lang-cpp's own, and a hover tooltip
// that shows a symbol's signature + doc. Declarative input (ToolchainCSymbol[])
// keeps the toolchain plugin free of any CodeMirror dependency.

export function cLibraryExtensions(
  support: LanguageSupport,
  symbols: readonly ToolchainCSymbol[],
): Extension[] {
  const byLabel = new Map(symbols.map((s) => [s.label, s]));

  const completeC = (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return {
      from: word.from,
      options: symbols.map((s) => ({
        label: s.label,
        type: "function",
        detail: s.detail,
        info: s.info,
      })),
      validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
    };
  };

  const hover = hoverTooltip((view, pos) => {
    const { text, from } = view.state.doc.lineAt(pos);
    const off = pos - from;
    // Expand to the identifier under the cursor.
    let s = off;
    while (s > 0 && /[A-Za-z0-9_]/.test(text[s - 1]!)) s--;
    let e = off;
    while (e < text.length && /[A-Za-z0-9_]/.test(text[e]!)) e++;
    const sym = byLabel.get(text.slice(s, e));
    if (!sym) return null;
    return {
      pos: from + s,
      end: from + e,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-mads-hover";
        if (sym.detail) {
          const code = document.createElement("strong");
          code.textContent = sym.detail;
          dom.appendChild(code);
        }
        if (sym.info) {
          const p = document.createElement("div");
          p.textContent = sym.info;
          dom.appendChild(p);
        }
        return { dom };
      },
    };
  });

  return [support.language.data.of({ autocomplete: completeC }), hover];
}
