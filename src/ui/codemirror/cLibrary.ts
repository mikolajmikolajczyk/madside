import type { Extension } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { StateEffect, StateField } from "@codemirror/state";
import type { LanguageSupport } from "@codemirror/language";
import { hoverTooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { ToolchainCSymbol } from "@ports";
import { scanCSymbols, type CSymbol } from "@app/cSymbols";

// Autocomplete + hover for C sources. Three symbol sources, in priority order:
//   1. The toolchain's C library (cc65 conio/stdlib, #48) — curated, carries the
//      header that declares it and auto-`#include`s it on accept.
//   2. Project-wide symbols (#58) — every `.c`/`.h` in the project, scanned by
//      the host and injected via `setProjectCSymbols`, so a function in
//      `helper.c` completes in `main.c`.
//   3. The active buffer's own (possibly unsaved) definitions.
// Declarative input keeps the toolchain plugin free of any CodeMirror dependency.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Project-wide C symbol index, injected per-edit by the host (#58). Mirrors the
// assembly `projectLabelsField` / `setProjectLabels` shape.
export const setProjectCSymbols = StateEffect.define<Map<string, CSymbol>>();
export const projectCSymbolsField = StateField.define<Map<string, CSymbol>>({
  create() { return new Map(); },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setProjectCSymbols)) return e.value;
    return value;
  },
});

const KIND_TYPE: Record<CSymbol["kind"], string> = {
  function: "function",
  macro: "constant",
  type: "type",
  global: "variable",
};

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

    const seen = new Set<string>(byLabel.keys());
    const options: Completion[] = symbols.map((s) => ({
      label: s.label,
      type: "function",
      // Header shown at a glance; the signature + doc go in the info popup.
      detail: s.header,
      info: [s.detail, s.info].filter(Boolean).join(" — ") || undefined,
      apply: apply(s),
    }));

    // Project-wide symbols (#58) — every other project file's top-level defs.
    const project = ctx.state.field(projectCSymbolsField, false);
    if (project) {
      for (const sym of project.values()) {
        if (seen.has(sym.label)) continue;
        seen.add(sym.label);
        options.push({ label: sym.label, type: KIND_TYPE[sym.kind], detail: sym.file });
      }
    }

    // The active buffer's own (unsaved) definitions, last so saved project
    // entries with the same name win their richer `detail`.
    for (const sym of scanCSymbols(ctx.state.doc.toString(), "")) {
      if (seen.has(sym.label)) continue;
      seen.add(sym.label);
      options.push({
        label: sym.label,
        type: KIND_TYPE[sym.kind],
        detail: sym.kind === "macro" ? "macro" : "in this file",
      });
    }

    return { from: word.from, options, validFor: /^[A-Za-z_][A-Za-z0-9_]*$/ };
  };

  const hover = hoverTooltip((view, pos) => {
    const { text, from } = view.state.doc.lineAt(pos);
    const off = pos - from;
    let s = off;
    while (s > 0 && /[A-Za-z0-9_]/.test(text[s - 1]!)) s--;
    let e = off;
    while (e < text.length && /[A-Za-z0-9_]/.test(text[e]!)) e++;
    const name = text.slice(s, e);
    const sym = byLabel.get(name);
    const proj = sym ? undefined : view.state.field(projectCSymbolsField, false)?.get(name);
    if (!sym && !proj) return null;
    return {
      pos: from + s,
      end: from + e,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-mads-hover";
        if (sym) {
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
        } else if (proj) {
          const code = document.createElement("strong");
          code.textContent = `${proj.kind} ${proj.label}`;
          dom.appendChild(code);
          const h = document.createElement("div");
          h.textContent = `defined in ${proj.file}`;
          dom.appendChild(h);
        }
        return { dom };
      },
    };
  });

  // NOTE: `projectCSymbolsField` is registered in the editor's *base* config (not
  // here) so it survives the language-pack compartment swap on a file switch —
  // mirroring `projectLabelsField`. These extensions only read it.
  return [support.language.data.of({ autocomplete: completeC }), hover];
}
