import { describe, expect, it } from "vitest";
import { asmDialectFor } from "./asmLsp";

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
