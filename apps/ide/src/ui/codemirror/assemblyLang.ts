import {
  StreamLanguage,
  type StringStream,
  LanguageSupport,
} from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { snippet, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { CpuLanguage, LabelInfo } from "@core";
import type { ToolchainLanguage } from "@ports";

// Generic 6502-family assembly language for CodeMirror (epic 78b12bf). Built
// from the machine CPU's opcode vocabulary (@core/cpu) + the active toolchain's
// language (directives, comments, snippets). Nothing here is MADS-specific —
// MADS, ca65, etc. each supply their ToolchainLanguage and get correct
// highlight / hover / autocomplete.

// Project labels are injected per-edit by the host (toolchain-agnostic shape).
export const setProjectLabels = StateEffect.define<Map<string, LabelInfo>>();
export const projectLabelsField = StateField.define<Map<string, LabelInfo>>({
  create() { return new Map(); },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setProjectLabels)) return e.value;
    return value;
  },
});

const hex4 = (n: number) => "$" + n.toString(16).toUpperCase().padStart(4, "0");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export interface LangSpec {
  opcodes: ReadonlySet<string>;
  directives: ReadonlySet<string>;
  commentRe: RegExp; // matches a whole line-comment at the cursor
  snippets: readonly { label: string; detail: string; template: string }[];
}

// An m68k mnemonic / data directive carries an operand-size suffix (`move.w`,
// `dc.l`) that isn't part of its name. The 6502 / z80 sets have no such suffix,
// so stripping a trailing `.b/.w/.l/.s` is a no-op there — it only ever turns a
// real suffixed token into the base name the opcode/directive set actually holds.
const stripSizeSuffix = (upper: string) => upper.replace(/\.[BWLS]$/, "");

/** True if `upper` (already upper-cased) is an opcode — directly or once its
 *  operand-size suffix is stripped (`MOVE.W` → `MOVE`). */
export function isOpcodeTok(upper: string, spec: LangSpec): boolean {
  return spec.opcodes.has(upper) || spec.opcodes.has(stripSizeSuffix(upper));
}

/** True if `upper` is a directive — honouring both a leading-dot form (`.WORD`)
 *  and an operand-size suffix (`DC.L` → `DC`). */
export function isDirectiveTok(upper: string, spec: LangSpec): boolean {
  const bare = upper.replace(/^\./, "");
  return (
    spec.directives.has(upper) ||
    spec.directives.has(bare) ||
    spec.directives.has(stripSizeSuffix(upper)) ||
    spec.directives.has(stripSizeSuffix(bare))
  );
}

function toSpec(cpu: CpuLanguage, lang: ToolchainLanguage): LangSpec {
  const markers = Array.isArray(lang.lineComment) ? lang.lineComment : [lang.lineComment];
  const commentRe = new RegExp(`^(?:${markers.map(escapeRe).join("|")})[^\n]*`);
  return {
    opcodes: cpu.opcodes,
    directives: new Set([...lang.directives].map((d) => d.toUpperCase())),
    commentRe,
    snippets: lang.snippets ?? [],
  };
}

function makeStream(spec: LangSpec) {
  return StreamLanguage.define({
    name: "asm",
    startState: () => ({}),
    token(stream: StringStream): string | null {
      if (stream.eatSpace()) return null;
      if (stream.match(spec.commentRe)) return "comment";
      if (stream.match(/'[^'\n]*'/)) return "string";
      if (stream.match(/"[^"\n]*"/)) return "string";
      if (stream.match(/\$[0-9a-fA-F]+/)) return "number";
      if (stream.match(/%[01]+/)) return "number";
      if (stream.match(/[0-9]+/)) return "number";
      if (stream.match(/[#<>(),+\-*/&|^!~=]/)) return "operatorKeyword";
      const m = stream.match(/[A-Za-z_.][A-Za-z0-9_.]*/) as RegExpMatchArray | null;
      if (m) {
        const upper = m[0].toUpperCase();
        if (isOpcodeTok(upper, spec)) return "keyword";
        if (isDirectiveTok(upper, spec)) return "atom";
        return "variableName";
      }
      stream.next();
      return null;
    },
    tokenTable: {},
  });
}

function makeCompletions(spec: LangSpec) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[A-Za-z_.][A-Za-z0-9_.]*/);
    if (!word) return null;
    if (word.from === word.to && !ctx.explicit) return null;

    const options: {
      label: string;
      type?: string;
      detail?: string;
      info?: () => HTMLElement;
      apply?: ReturnType<typeof snippet>;
      boost?: number;
    }[] = [];

    // Bare opcode keywords — descriptions + addressing modes come from the asm
    // LSP's completion (#140); the StreamLanguage just lists the vocabulary.
    for (const op of spec.opcodes) {
      options.push({ label: op.toLowerCase(), type: "keyword" });
    }
    for (const d of spec.directives) options.push({ label: d.toLowerCase(), type: "keyword", detail: "directive" });

    for (const s of spec.snippets) options.push({
      label: s.label,
      detail: s.detail,
      type: "function",
      apply: snippet(s.template),
      boost: 5,
    });

    const text = ctx.state.doc.toString();
    const seen = new Set<string>();
    const labelRe = /^([A-Za-z_][A-Za-z0-9_]*)\b/gm;
    for (const m of text.matchAll(labelRe)) {
      const name = m[1];
      const upper = name.toUpperCase();
      if (spec.opcodes.has(upper) || spec.directives.has(upper)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      options.push({ label: name, type: "variable" });
    }

    const labels = ctx.state.field(projectLabelsField, false);
    if (labels) {
      for (const [name, info] of labels) {
        if (seen.has(name)) continue;
        seen.add(name);
        const parts: string[] = [];
        if (info.addr != null) parts.push(hex4(info.addr));
        if (info.file) parts.push(`${info.file}:${info.line}`);
        const opt: typeof options[number] = {
          label: name,
          type: "variable",
          detail: parts.join(" · ") || undefined,
        };
        if (info.preview || info.doc) opt.info = () => makePreviewDom(info, spec);
        options.push(opt);
      }
    }

    return { from: word.from, options, validFor: /^[A-Za-z0-9_.]*$/ };
  };
}

function makePreviewDom(info: LabelInfo, spec: LangSpec): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "cm-mads-preview";
  const headParts: string[] = [];
  if (info.file && info.line != null) headParts.push(`${info.file}:${info.line}`);
  if (info.addr != null) headParts.push(hex4(info.addr));
  if (headParts.length) {
    const head = document.createElement("div");
    head.className = "cm-mads-preview-head";
    head.textContent = headParts.join("  ");
    wrap.appendChild(head);
  }
  if (info.doc) {
    const doc = document.createElement("div");
    doc.className = "cm-mads-preview-doc";
    doc.textContent = info.doc;
    wrap.appendChild(doc);
  }
  if (info.preview) {
    wrap.appendChild(renderAsmCode(info.preview, spec));
  }
  return wrap;
}

// Highlight a code snippet inside hover/info popups without hosting a full
// CodeMirror instance. Mirrors the StreamLanguage tokenizer above.
function renderAsmCode(code: string, spec: LangSpec): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "cm-mads-preview-body";
  const lines = code.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) pre.appendChild(document.createTextNode("\n"));
    tokenizeLine(lines[li], pre, spec);
  }
  return pre;
}

function tokenizeLine(line: string, target: HTMLElement, spec: LangSpec) {
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    const ws = /^[ \t]+/.exec(rest);
    if (ws) { target.appendChild(document.createTextNode(ws[0])); i += ws[0].length; continue; }

    const cm = spec.commentRe.exec(rest);
    if (cm && cm.index === 0) { appendTok(target, cm[0], "comment"); i += cm[0].length; continue; }

    const sm = /^(?:'[^'\n]*'|"[^"\n]*")/.exec(rest);
    if (sm) { appendTok(target, sm[0], "string"); i += sm[0].length; continue; }

    const nm = /^(?:\$[0-9a-fA-F]+|%[01]+|[0-9]+)/.exec(rest);
    if (nm) { appendTok(target, nm[0], "number"); i += nm[0].length; continue; }

    const om = /^[#<>(),+\-*/&|^!~=:]/.exec(rest);
    if (om) { appendTok(target, om[0], "op"); i += om[0].length; continue; }

    const im = /^[A-Za-z_.][A-Za-z0-9_.]*/.exec(rest);
    if (im) {
      const upper = im[0].toUpperCase();
      let cls: string;
      if (isOpcodeTok(upper, spec)) cls = "keyword";
      else if (isDirectiveTok(upper, spec)) cls = "directive";
      else cls = "ident";
      appendTok(target, im[0], cls);
      i += im[0].length;
      continue;
    }

    target.appendChild(document.createTextNode(rest[0]));
    i++;
  }
}

function appendTok(parent: HTMLElement, text: string, cls: string) {
  const span = document.createElement("span");
  span.className = "cm-mads-tok-" + cls;
  span.textContent = text;
  parent.appendChild(span);
}

function parseLiteral(text: string): number | null {
  if (/^\$[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(1), 16);
  if (/^%[01]+$/.test(text)) return parseInt(text.slice(1), 2);
  if (/^[0-9]+$/.test(text)) return parseInt(text, 10);
  return null;
}

function makeHover(spec: LangSpec) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;

    // Literal first ($/%-prefixed aren't word chars).
    for (const m of line.text.matchAll(/(\$[0-9a-fA-F]+|%[01]+|\d+)/g)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (offset < start || offset > end) continue;
      const n = parseLiteral(m[0]);
      if (n == null) continue;
      return {
        pos: line.from + start,
        end: line.from + end,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cm-mads-hover";
          const hex = "0x" + n.toString(16).toUpperCase();
          const dec = n.toString(10);
          const bin = "%" + n.toString(2);
          const ascii = n >= 0x20 && n < 0x7f ? "'" + String.fromCharCode(n) + "'" : null;
          dom.textContent = [hex, dec, bin, ascii].filter(Boolean).join("   ·   ");
          return { dom };
        },
      };
    }

    // Word-based: opcodes / labels.
    const word = view.state.wordAt(pos);
    if (!word) return null;
    const text = view.state.doc.sliceString(word.from, word.to);
    // Opcode hover (description + flags + addressing modes) is served by the asm
    // LSP (#140); the StreamLanguage handles only label/equate hover below.
    const labels = view.state.field(projectLabelsField, false);
    const info = labels?.get(text);
    if (info) {
      return {
        pos: word.from,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cm-mads-hover";
          if (info.preview || info.doc) {
            dom.appendChild(makePreviewDom(info, spec));
          } else {
            const headLine = document.createElement("div");
            const parts: string[] = [text];
            if (info.addr != null) parts.push("= " + hex4(info.addr));
            if (info.file) parts.push(`(${info.file}:${info.line})`);
            headLine.textContent = parts.join(" ");
            dom.appendChild(headLine);
          }
          return { dom };
        },
      };
    }

    return null;
  });
}

/** Build the CodeMirror language for a CPU + toolchain pair. */
export function buildAssemblyLanguage(cpu: CpuLanguage, lang: ToolchainLanguage): LanguageSupport {
  const spec = toSpec(cpu, lang);
  const stream = makeStream(spec);
  return new LanguageSupport(stream, [
    stream.data.of({ autocomplete: makeCompletions(spec) }),
    makeHover(spec),
  ]);
}
