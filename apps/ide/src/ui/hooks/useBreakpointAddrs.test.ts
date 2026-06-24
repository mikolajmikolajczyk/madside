import { describe, expect, it } from "vitest";
import { resolveBreakpoints } from "./useBreakpointAddrs";
import type { BankBreakpoint, SourceMap } from "@ports";

// A banked build: line 13 of game.asm was assembled into bank1 at $4005;
// line 5 of a flat file sits at $2000 with no bank.
const BANKED: SourceMap = {
  addrToLoc: new Map([
    [0x2000, { file: "flat.asm", line: 5 }],
    [0x4005, { file: "game.asm", line: 13, space: "bank1" }],
  ]),
  locToAddr: new Map([
    ["flat.asm", new Map([[5, 0x2000]])],
    ["game.asm", new Map([[13, 0x4005]])],
  ]),
  bankedAddrToLoc: new Map([
    [0x4005, [{ file: "game.asm", line: 13, space: "bank1" }]],
  ]),
};

describe("resolveBreakpoints — bank-aware emission (ADR-0014)", () => {
  it("emits a BankBreakpoint for a banked line", () => {
    const out = resolveBreakpoints(BANKED, new Map([["game.asm", new Set([13])]]));
    expect([...out]).toEqual([{ addr: 0x4005, space: "bank1" } satisfies BankBreakpoint]);
  });

  it("emits a bare number for a flat line (cpu space, verbatim)", () => {
    const out = resolveBreakpoints(BANKED, new Map([["flat.asm", new Set([5])]]));
    expect([...out]).toEqual([0x2000]);
  });

  it("handles mixed flat + banked breakpoints", () => {
    const out = resolveBreakpoints(
      BANKED,
      new Map([["flat.asm", new Set([5])], ["game.asm", new Set([13])]]),
    );
    expect(out.has(0x2000)).toBe(true);
    expect([...out]).toContainEqual({ addr: 0x4005, space: "bank1" });
  });

  it("a flat build (no bankedAddrToLoc) emits only bare numbers", () => {
    const flat: SourceMap = {
      addrToLoc: new Map([[0x2000, { file: "flat.asm", line: 5 }]]),
      locToAddr: new Map([["flat.asm", new Map([[5, 0x2000]])]]),
    };
    const out = resolveBreakpoints(flat, new Map([["flat.asm", new Set([5])]]));
    expect([...out]).toEqual([0x2000]);
  });
});
