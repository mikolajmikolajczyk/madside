import { describe, expect, it } from "vitest";
import { isOpcodeTok, isDirectiveTok, type LangSpec } from "./assemblyLang";

// The m68k vocab uses operand-size suffixes (`move.w`, `dc.l`) that aren't part
// of the mnemonic/directive name — the highlighter must strip them before the
// set lookup, else most 68k instructions stay uncoloured (#bug: weak 68k colour).
const spec: LangSpec = {
  opcodes: new Set(["MOVE", "LEA", "DBRA", "ADDI"]),
  directives: new Set(["DC", "ORG", "EVEN"]),
  commentRe: /^;[^\n]*/,
  snippets: [],
};

describe("assemblyLang token classification (size suffixes)", () => {
  it("colours size-suffixed opcodes as opcodes", () => {
    expect(isOpcodeTok("MOVE.W", spec)).toBe(true);
    expect(isOpcodeTok("MOVE.B", spec)).toBe(true);
    expect(isOpcodeTok("ADDI.L", spec)).toBe(true);
    expect(isOpcodeTok("LEA", spec)).toBe(true); // unsuffixed still works
    expect(isOpcodeTok("DBRA", spec)).toBe(true);
  });

  it("colours size-suffixed data directives as directives", () => {
    expect(isDirectiveTok("DC.W", spec)).toBe(true);
    expect(isDirectiveTok("DC.L", spec)).toBe(true);
    expect(isDirectiveTok("DC.B", spec)).toBe(true);
    expect(isDirectiveTok("ORG", spec)).toBe(true);
  });

  it("does not misclassify ordinary symbols", () => {
    expect(isOpcodeTok("VDP_CTRL", spec)).toBe(false);
    expect(isOpcodeTok("VDPREGS", spec)).toBe(false);
    // a symbol that merely ends in a size-looking suffix but whose base isn't an
    // opcode stays a symbol.
    expect(isOpcodeTok("DATA.W", spec)).toBe(false);
    expect(isDirectiveTok("DATA.W", spec)).toBe(false);
  });
});
