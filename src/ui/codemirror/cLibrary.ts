import type { Extension } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import type { LanguageSupport } from "@codemirror/language";
import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { ToolchainCSymbol } from "@ports";

// Autocomplete + hover for a toolchain's C library symbols (cc65 conio/stdlib,
// #48). Each symbol carries the header that declares it, so the completion shows
// it and — crucially — auto-`#include`s it when accepted: the user gets the
// function AND learns where it comes from. Declarative input keeps the toolchain
// plugin free of any CodeMirror dependency.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A change that adds `#include <header>` if the doc doesn't already include it,
 *  placed after the last existing #include (else at the top). */
function includeInsert(state: EditorState, header: string): { from: number; insert: string } | null {
  const text = state.doc.toString();
  if (new RegExp(`#\\s*include\\s*[<"]${escapeRe(header)}[>"]`).test(text)) return null;
  const incRe = /^[ \t]*#\s*include\b.*$/gm;
  let m: RegExpExecArray | null;
  let lastEnd = -1;
  while ((m = incRe.exec(text))) lastEnd = m.index + m[0].length;
  return lastEnd >= 0
    ? { from: lastEnd, insert: `\n#include <${header}>` }
    : { from: 0, insert: `#include <${header}>\n` };
}

export function cLibraryExtensions(
  support: LanguageSupport,
  symbols: readonly ToolchainCSymbol[],
): Extension[] {
  const byLabel = new Map(symbols.map((s) => [s.label, s]));

  const apply = (sym: ToolchainCSymbol) =>
    (view: EditorView, _c: Completion, from: number, to: number) => {
      const inc = sym.header ? includeInsert(view.state, sym.header) : null;
      const changes: { from: number; to?: number; insert: string }[] = [{ from, to, insert: sym.label }];
      if (inc) changes.push(inc);
      // The include (if any) sits before `from`, so the caret shifts by its length.
      const shift = inc && inc.from <= from ? inc.insert.length : 0;
      view.dispatch({
        changes,
        selection: { anchor: from + sym.label.length + shift },
      });
    };

  const completeC = (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return {
      from: word.from,
      options: symbols.map((s) => ({
        label: s.label,
        type: "function",
        // Header shown at a glance; the signature + doc go in the info popup.
        detail: s.header,
        info: [s.detail, s.info].filter(Boolean).join(" — ") || undefined,
        apply: apply(s),
      })),
      validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
    };
  };

  const hover = hoverTooltip((view, pos) => {
    const { text, from } = view.state.doc.lineAt(pos);
    const off = pos - from;
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
        if (sym.header) {
          const h = document.createElement("div");
          h.textContent = `#include <${sym.header}>`;
          dom.appendChild(h);
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
