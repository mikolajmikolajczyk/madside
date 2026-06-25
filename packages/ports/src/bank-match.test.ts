import { describe, expect, it } from "vitest";
import { splitBreakpoints, breakpointFires } from "./bank-match";

describe("bank-match native-width addresses (#146)", () => {
  it("keeps 68000 breakpoint addresses past \\$FFFF (no 16-bit truncation)", () => {
    // Genesis 68000 ROM maps from \$000000; a game's code routinely sits above
    // \$FFFF. The breakpoint must fire at the full PC, not a 16-bit-masked one —
    // otherwise the wasm traps but this JS predicate never matches and the run
    // loop spins forever.
    const addr = 0x12_3456; // 24-bit, > \$FFFF
    const split = splitBreakpoints([addr]);
    expect(split.cpuAddrs.has(addr)).toBe(true);
    expect(breakpointFires(addr, split, undefined)).toBe(true);
    // The low 16 bits alone must NOT be treated as the breakpoint.
    expect(breakpointFires(addr & 0xffff, split, undefined)).toBe(false);
  });

  it("still fires for ≤64K addresses (6502 / Z80 unaffected)", () => {
    const split = splitBreakpoints([0x8000]);
    expect(breakpointFires(0x8000, split, undefined)).toBe(true);
    expect(breakpointFires(0x8001, split, undefined)).toBe(false);
  });

  it("a banked breakpoint fires only when the live bank matches, at native width", () => {
    const addr = 0x1_8000; // > \$FFFF + banked
    const split = splitBreakpoints([{ addr, space: "bank3" }]);
    const map = [{ window: "z80bank", start: 0x10000, end: 0x1ffff, space: "bank3", bankOffset: 0x18000 }];
    expect(breakpointFires(addr, split, map)).toBe(true);
    const wrong = [{ window: "z80bank", start: 0x10000, end: 0x1ffff, space: "bank5", bankOffset: 0x28000 }];
    expect(breakpointFires(addr, split, wrong)).toBe(false);
  });
});
