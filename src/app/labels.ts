// Source-scoped label extraction. Two paths:
//
//   1. Scan a source buffer for column-0 identifiers (skipping opcodes
//      and directives) — works even before the first assemble (no .lab
//      yet) and catches local labels MADS omits from the dump.
//
//   2. Merge `.lab` dump addresses into the same `LabelInfo` so the
//      hover popup / goto-def can show both.

import type { CpuLanguage, LabelInfo } from "@core";
import type { ToolchainLanguage } from "@ports";

/** Reserved words (CPU opcodes + toolchain directives, uppercase) the label
 *  scanner skips so they aren't mistaken for user labels. CodeMirror-free so
 *  @ui can build it without pulling the editor lib into the eager bundle. */
export function reservedWords(cpu: CpuLanguage, lang: ToolchainLanguage): ReadonlySet<string> {
  const out = new Set<string>(cpu.opcodes);
  for (const d of lang.directives) out.add(d.toUpperCase());
  return out;
}

// Line-based cores — the file is split once by the caller and reused, instead
// of re-splitting the whole buffer for every label (was O(labels × lines)).

function previewFromLines(lines: string[], startLine: number, max = 10): string {
  if (startLine < 1 || startLine > lines.length) return "";
  const out: string[] = [];
  for (let i = startLine - 1; i < lines.length && out.length < max; i++) {
    const ln = lines[i];
    if (out.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*/.test(ln)) break;
    out.push(ln);
  }
  return out.join("\n").trimEnd();
}

function docFromLines(lines: string[], startLine: number): string {
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

/** Pull a short body preview starting at the label's declaration line.
 *  Stops at the next top-level label or after `max` lines. */
export function extractPreview(content: string, startLine: number, max = 10): string {
  return previewFromLines(content.split(/\r?\n/), startLine, max);
}

/** Read `;` comment lines immediately above the declaration as a doc block. */
export function extractDoc(content: string, startLine: number): string {
  return docFromLines(content.split(/\r?\n/), startLine);
}

/** Scan one source buffer for label declarations, splitting it once. First
 *  definition wins on in-file collisions. Pure + content-addressable, so the
 *  caller can cache the result by file content and skip unchanged files. */
export function scanFile(content: string, base: string, reserved: ReadonlySet<string>): Map<string, LabelInfo> {
  const lines = content.split(/\r?\n/);
  const out = new Map<string, LabelInfo>();
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    if (reserved.has(name.toUpperCase())) continue;
    if (out.has(name)) continue;
    const lineNo = i + 1;
    const info: LabelInfo = { file: base, line: lineNo, preview: previewFromLines(lines, lineNo) };
    const doc = docFromLines(lines, lineNo);
    if (doc) info.doc = doc;
    out.set(name, info);
  }
  return out;
}

/** Scan a single source buffer and merge its labels into `out` (first wins). */
export function scanFileLabels(
  content: string,
  base: string,
  out: Map<string, LabelInfo>,
  reserved: ReadonlySet<string>,
) {
  for (const [name, info] of scanFile(content, base, reserved)) {
    if (!out.has(name)) out.set(name, info);
  }
}
