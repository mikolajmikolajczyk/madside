// Source-scoped label extraction. Two paths:
//
//   1. Scan a source buffer for column-0 identifiers (skipping opcodes
//      and directives) — works even before the first assemble (no .lab
//      yet) and catches local labels MADS omits from the dump.
//
//   2. Merge `.lab` dump addresses into the same `LabelInfo` so the
//      hover popup / goto-def can show both.

import { MADS_DIRECTIVES, MADS_OPCODES, type LabelInfo } from "@ui/codemirror";

/** Pull a short body preview starting at the label's declaration line.
 *  Stops at the next top-level label or after `max` lines. */
export function extractPreview(content: string, startLine: number, max = 10): string {
  const lines = content.split(/\r?\n/);
  if (startLine < 1 || startLine > lines.length) return "";
  const out: string[] = [];
  for (let i = startLine - 1; i < lines.length && out.length < max; i++) {
    const ln = lines[i];
    if (out.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*/.test(ln)) break;
    out.push(ln);
  }
  return out.join("\n").trimEnd();
}

/** Read `;` comment lines immediately above the declaration as a doc
 *  block. Stops at the first blank or non-comment line. */
export function extractDoc(content: string, startLine: number): string {
  const lines = content.split(/\r?\n/);
  if (startLine < 2) return "";
  const out: string[] = [];
  for (let i = startLine - 2; i >= 0; i--) {
    const stripped = lines[i].replace(/^\s+/, "");
    if (stripped.startsWith(";")) {
      out.unshift(stripped.replace(/^;+\s?/, ""));
      continue;
    }
    break;
  }
  return out.join("\n");
}

/** Scan a single source buffer for label declarations and merge them
 *  into `out`. First definition wins on collisions. */
export function scanFileLabels(content: string, base: string, out: Map<string, LabelInfo>) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    const upper = name.toUpperCase();
    if (MADS_OPCODES.has(upper) || MADS_DIRECTIVES.has(upper)) continue;
    if (out.has(name)) continue;
    const lineNo = i + 1;
    const info: LabelInfo = {
      file: base,
      line: lineNo,
      preview: extractPreview(content, lineNo),
    };
    const doc = extractDoc(content, lineNo);
    if (doc) info.doc = doc;
    out.set(name, info);
  }
}
