import { describe, expect, it } from "vitest";
import { asmDialectFor, classifyAsmDialects } from "./asmLsp";

describe("classifyAsmDialects (#148)", () => {
  const classify = (files: { path: string; text: string }[], tc?: string) =>
    classifyAsmDialects(files, tc);

  it("routes each file in a mixed Genesis project to its own dialect", () => {
    const m = classify(
      [
        { path: "src/main.asm", text: '\tinclude "src/shared.inc"\n' },
        { path: "src/driver.s80", text: '\tinclude "src/sound.inc"\n\tinclude "src/shared.inc"\n' },
        { path: "src/sound.inc", text: "; z80 tables\n" },
        { path: "src/shared.inc", text: "; shared equates\n" },
      ],
      "clownassembler",
    );
    // Anchors get their extension/toolchain dialect.
    expect(m.get("src/main.asm")!.dialects).toEqual(["clownassembler"]);
    expect(m.get("src/driver.s80")!.dialects).toEqual(["z80asm"]);
    // An include inherits its includer's dialect.
    expect(m.get("src/sound.inc")!.dialects).toEqual(["z80asm"]);
    // A shared include belongs to BOTH dialects.
    expect(new Set(m.get("src/shared.inc")!.dialects)).toEqual(new Set(["clownassembler", "z80asm"]));
  });

  it("a single-dialect project keeps every file on one dialect", () => {
    const m = classify(
      [
        { path: "src/main.asm", text: '\tinclude "src/lib.inc"\n' },
        { path: "src/lib.inc", text: "; macros\n" },
      ],
      "mads",
    );
    expect(m.get("src/main.asm")!.dialects).toEqual(["mads"]);
    expect(m.get("src/lib.inc")!.dialects).toEqual(["mads"]);
  });

  it("gives each file a single diagnostics owner", () => {
    const m = classify(
      [
        { path: "a.asm", text: '\tinclude "shared.inc"\n' },
        { path: "b.s80", text: '\tinclude "shared.inc"\n' },
        { path: "shared.inc", text: "" },
      ],
      "clownassembler",
    );
    // Anchors own themselves; the shared include has one deterministic owner.
    expect(m.get("a.asm")!.owner).toBe("clownassembler");
    expect(m.get("b.s80")!.owner).toBe("z80asm");
    expect(m.get("shared.inc")!.dialects).toContain("clownassembler");
    expect(m.get("shared.inc")!.dialects).toContain("z80asm");
    expect(["clownassembler", "z80asm"]).toContain(m.get("shared.inc")!.owner);
  });
});

describe("asmDialectFor", () => {
  it("maps a toolchain id to its asm dialect", () => {
    expect(asmDialectFor("mads")).toBe("mads");
    expect(asmDialectFor("ca65")).toBe("ca65");
    expect(asmDialectFor("z88dk")).toBe("z80asm");
    expect(asmDialectFor("clownassembler")).toBe("clownassembler");
    expect(asmDialectFor(undefined)).toBeUndefined();
    expect(asmDialectFor("unknown")).toBeUndefined();
  });

  it("forces the z80 dialect for a .s80 file regardless of toolchain", () => {
    // The Genesis Z80 driver is z80, not the project's M68k (clownassembler).
    expect(asmDialectFor("clownassembler", "src/sound/driver.s80")).toBe("z80asm");
    expect(asmDialectFor("clownassembler", "DRIVER.S80")).toBe("z80asm");
    // A normal M68k file stays on the toolchain dialect.
    expect(asmDialectFor("clownassembler", "src/main.asm")).toBe("clownassembler");
  });
});
