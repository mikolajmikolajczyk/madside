import {
  StreamLanguage,
  type StringStream,
  LanguageSupport,
} from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import { snippet, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";

const OPCODES = new Set([
  "ADC","AND","ASL","BCC","BCS","BEQ","BIT","BMI","BNE","BPL","BRK","BVC","BVS",
  "CLC","CLD","CLI","CLV","CMP","CPX","CPY","DEC","DEX","DEY","EOR","INC","INX",
  "INY","JMP","JSR","LDA","LDX","LDY","LSR","NOP","ORA","PHA","PHP","PLA","PLP",
  "ROL","ROR","RTI","RTS","SBC","SEC","SED","SEI","STA","STX","STY","TAX","TAY",
  "TSX","TXA","TXS","TYA",
]);

const DIRECTIVES = new Set([
  "ORG","EQU","DTA","ICL","INS","RUN","END","OPT","RMB","SET","BLK","RPT","ERT",
  "MACRO","ENDM","PROC","ENDP","STRUCT","ENDS","SMB","LOCAL","ELS","EIF",
]);

// Short docs for hover tooltips. [description, affected flags].
const OPCODE_INFO: Record<string, [string, string]> = {
  ADC: ["Add memory to A with carry", "N V Z C"],
  AND: ["Bitwise AND with A", "N Z"],
  ASL: ["Arithmetic shift left", "N Z C"],
  BCC: ["Branch if carry clear", ""],
  BCS: ["Branch if carry set", ""],
  BEQ: ["Branch if equal (Z set)", ""],
  BIT: ["Test bits in A vs memory", "N V Z"],
  BMI: ["Branch if minus (N set)", ""],
  BNE: ["Branch if not equal (Z clear)", ""],
  BPL: ["Branch if plus (N clear)", ""],
  BRK: ["Force interrupt", "B I"],
  BVC: ["Branch if overflow clear", ""],
  BVS: ["Branch if overflow set", ""],
  CLC: ["Clear carry flag", "C"],
  CLD: ["Clear decimal mode", "D"],
  CLI: ["Clear interrupt disable", "I"],
  CLV: ["Clear overflow flag", "V"],
  CMP: ["Compare A with memory", "N Z C"],
  CPX: ["Compare X with memory", "N Z C"],
  CPY: ["Compare Y with memory", "N Z C"],
  DEC: ["Decrement memory", "N Z"],
  DEX: ["Decrement X", "N Z"],
  DEY: ["Decrement Y", "N Z"],
  EOR: ["Bitwise XOR with A", "N Z"],
  INC: ["Increment memory", "N Z"],
  INX: ["Increment X", "N Z"],
  INY: ["Increment Y", "N Z"],
  JMP: ["Unconditional jump", ""],
  JSR: ["Jump to subroutine (push PC)", ""],
  LDA: ["Load A from memory", "N Z"],
  LDX: ["Load X from memory", "N Z"],
  LDY: ["Load Y from memory", "N Z"],
  LSR: ["Logical shift right", "N Z C"],
  NOP: ["No operation", ""],
  ORA: ["Bitwise OR with A", "N Z"],
  PHA: ["Push A onto stack", ""],
  PHP: ["Push processor status", ""],
  PLA: ["Pull A from stack", "N Z"],
  PLP: ["Pull processor status", "all"],
  ROL: ["Rotate left through carry", "N Z C"],
  ROR: ["Rotate right through carry", "N Z C"],
  RTI: ["Return from interrupt", "all"],
  RTS: ["Return from subroutine", ""],
  SBC: ["Subtract memory from A with borrow", "N V Z C"],
  SEC: ["Set carry flag", "C"],
  SED: ["Set decimal mode", "D"],
  SEI: ["Set interrupt disable", "I"],
  STA: ["Store A to memory", ""],
  STX: ["Store X to memory", ""],
  STY: ["Store Y to memory", ""],
  TAX: ["Transfer A to X", "N Z"],
  TAY: ["Transfer A to Y", "N Z"],
  TSX: ["Transfer stack pointer to X", "N Z"],
  TXA: ["Transfer X to A", "N Z"],
  TXS: ["Transfer X to stack pointer", ""],
  TYA: ["Transfer Y to A", "N Z"],
};

const madsStream = StreamLanguage.define({
  name: "mads",
  startState: () => ({}),
  token(stream: StringStream): string | null {
    if (stream.eatSpace()) return null;
    if (stream.match(/;[^\n]*/)) return "comment";
    if (stream.match(/\/\/[^\n]*/)) return "comment";
    if (stream.match(/'[^'\n]*'/)) return "string";
    if (stream.match(/"[^"\n]*"/)) return "string";
    if (stream.match(/\$[0-9a-fA-F]+/)) return "number";
    if (stream.match(/%[01]+/)) return "number";
    if (stream.match(/[0-9]+/)) return "number";
    if (stream.match(/[#<>(),+\-*/&|^!~=]/)) return "operatorKeyword";
    const m = stream.match(/[A-Za-z_.][A-Za-z0-9_.]*/) as RegExpMatchArray | null;
    if (m) {
      const upper = m[0].toUpperCase();
      if (OPCODES.has(upper)) return "keyword";
      if (DIRECTIVES.has(upper) || DIRECTIVES.has(upper.replace(/^\./, ""))) return "atom";
      return "variableName";
    }
    stream.next();
    return null;
  },
  tokenTable: {},
});

export interface LabelInfo {
  addr?: number;
  file?: string;       // basename
  line?: number;
  preview?: string;    // multi-line source preview starting at declaration
  doc?: string;        // leading `;` comment block above the declaration
}

// Re-exported so the App-level scanner can skip opcodes/directives.
export const MADS_OPCODES = OPCODES;
export const MADS_DIRECTIVES = DIRECTIVES;

export const setProjectLabels = StateEffect.define<Map<string, LabelInfo>>();
export const projectLabelsField = StateField.define<Map<string, LabelInfo>>({
  create() { return new Map(); },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setProjectLabels)) return e.value;
    return value;
  },
});

const hex4 = (n: number) => "$" + n.toString(16).toUpperCase().padStart(4, "0");

// === Snippets ===

const SNIPPETS: { label: string; detail: string; template: string }[] = [
  {
    label: "loop-y",
    detail: "ldy loop body",
    template: "        ldy #0\n${1:loop}\n        ${2:; body}\n        iny\n        cpy #${3:length}\n        bne ${1:loop}\n",
  },
  {
    label: "loop-x",
    detail: "ldx loop body",
    template: "        ldx #0\n${1:loop}\n        ${2:; body}\n        inx\n        cpx #${3:length}\n        bne ${1:loop}\n",
  },
  {
    label: "wait-vbl",
    detail: "wait for vertical blank",
    template: "${1:wait}\n        lda RTCLOK+2\n        cmp RTCLOK+2\n        beq ${1:wait}\n",
  },
  {
    label: "ptr-set",
    detail: "load 16-bit pointer to zero page",
    template: "        lda #<${1:label}\n        sta ${2:ptr}\n        lda #>${1:label}\n        sta ${2:ptr}+1\n",
  },
  {
    label: "sub-template",
    detail: "subroutine skeleton",
    template: "${1:name}\n        ${2:; body}\n        rts\n",
  },
  {
    label: "program",
    detail: "minimal program skeleton",
    template: "        icl 'atari.a65'\n        org $${1:2000}\n\nstart\n        ${2:; main}\n        jmp *\n\n        run start\n",
  },
];

function madsCompletions(ctx: CompletionContext): CompletionResult | null {
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

  for (const op of OPCODES) {
    const info = OPCODE_INFO[op];
    options.push({ label: op.toLowerCase(), type: "keyword", detail: info?.[0] });
  }
  for (const d of DIRECTIVES) options.push({ label: d.toLowerCase(), type: "keyword", detail: "directive" });

  // Snippets — boost so they appear near the top when the prefix matches.
  for (const s of SNIPPETS) options.push({
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
    if (OPCODES.has(upper) || DIRECTIVES.has(upper)) continue;
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
      if (info.preview || info.doc) opt.info = () => makePreviewDom(info);
      options.push(opt);
    }
  }

  return { from: word.from, options, validFor: /^[A-Za-z0-9_.]*$/ };
}

function makePreviewDom(info: LabelInfo): HTMLElement {
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
    wrap.appendChild(renderMadsCode(info.preview));
  }
  return wrap;
}

// Apply MADS syntax highlighting to a code snippet inside hover/info popups.
// Mirrors the StreamLanguage tokenizer above, but emits styled spans directly
// so popups don't need to host a full CodeMirror instance.
function renderMadsCode(code: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "cm-mads-preview-body";
  const lines = code.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) pre.appendChild(document.createTextNode("\n"));
    tokenizeMadsLine(lines[li], pre);
  }
  return pre;
}

function tokenizeMadsLine(line: string, target: HTMLElement) {
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    const ws = /^[ \t]+/.exec(rest);
    if (ws) { target.appendChild(document.createTextNode(ws[0])); i += ws[0].length; continue; }

    const cm = /^(?:;[^\n]*|\/\/[^\n]*)/.exec(rest);
    if (cm) { appendTok(target, cm[0], "comment"); i += cm[0].length; continue; }

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
      if (OPCODES.has(upper)) cls = "keyword";
      else if (DIRECTIVES.has(upper) || DIRECTIVES.has(upper.replace(/^\./, ""))) cls = "directive";
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

// === Hover tooltips ===

function parseLiteral(text: string): number | null {
  if (/^\$[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(1), 16);
  if (/^%[01]+$/.test(text)) return parseInt(text.slice(1), 2);
  if (/^[0-9]+$/.test(text)) return parseInt(text, 10);
  return null;
}

const madsHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;

  // Try literal first (numbers can include `$` and `%` which aren't word chars).
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
  const upper = text.toUpperCase();
  const opInfo = OPCODE_INFO[upper];
  if (opInfo) {
    return {
      pos: word.from,
      end: word.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-mads-hover";
        const head = document.createElement("strong");
        head.textContent = upper;
        const body = document.createElement("span");
        body.textContent = "  " + opInfo[0] + (opInfo[1] ? "   flags: " + opInfo[1] : "");
        dom.appendChild(head);
        dom.appendChild(body);
        return { dom };
      },
    };
  }

  // Label info from project labels.
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
          dom.appendChild(makePreviewDom(info));
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

export function madsLanguage() {
  return new LanguageSupport(madsStream, [
    madsStream.data.of({ autocomplete: madsCompletions }),
    madsHover,
  ]);
}
