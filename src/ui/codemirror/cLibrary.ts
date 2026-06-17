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

// C keywords that look like identifiers in the scan but aren't completable defs.
const C_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "return", "sizeof",
  "void", "char", "int", "long", "short", "unsigned", "signed", "const",
  "static", "struct", "union", "enum", "typedef", "extern", "register",
]);

/** Scan a C buffer for the user's own completable symbols — function/global
 *  definitions (`type name(` / `type name =` / `type name;`) and `#define`s.
 *  Regex, not a full parse, but dynamic + good enough; excludes library symbols
 *  (offered separately) and keywords. */
function scanBufferSymbols(
  text: string,
  libSymbols: Map<string, unknown>,
): { label: string; type: string; detail: string }[] {
  const out = new Map<string, string>(); // name → kind
  // function definitions / prototypes: `... name(`
  for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    const name = m[1]!;
    if (!C_KEYWORDS.has(name) && !libSymbols.has(name)) out.set(name, "function");
  }
  // #define NAME
  for (const m of text.matchAll(/^[ \t]*#\s*define\s+([A-Za-z_]\w*)/gm)) {
    out.set(m[1]!, "constant");
  }
  return [...out].map(([label, type]) => ({
    label,
    type,
    detail: type === "function" ? "in this file" : "macro",
  }));
}

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
    // Library symbols (with auto-#include) plus the buffer's own definitions, so
    // a user's functions / macros complete alongside the cc65 stdlib (#48).
    const buffer = scanBufferSymbols(ctx.state.doc.toString(), byLabel);
    return {
      from: word.from,
      options: [
        ...symbols.map((s) => ({
          label: s.label,
          type: "function",
          // Header shown at a glance; the signature + doc go in the info popup.
          detail: s.header,
          info: [s.detail, s.info].filter(Boolean).join(" — ") || undefined,
          apply: apply(s),
        })),
        ...buffer,
      ],
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
