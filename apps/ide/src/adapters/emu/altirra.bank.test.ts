import { describe, expect, it } from "vitest";
import { decodeBankWindow } from "./altirra";
import type { BankWindow } from "@ports";

// The 130XE window as machine-atari-xl declares it (ADR-0014 Phase 1): the
// $4000–$7FFF window, 4 ext banks, PORTB $D301 bits 2–3, CPE = bit 4 (must be
// 0 for CPU ext access).
const W: BankWindow = {
  id: "main",
  start: 0x4000,
  end: 0x7fff,
  bankCount: 4,
  spacePrefix: "bank",
  selector: { reg: 0xd301, mask: 0x0c, shift: 2, enableMask: 0x10, enableValue: 0x00 },
};

describe("decodeBankWindow — 130XE PORTB projection (ADR-0014)", () => {
  it("decodes each of the 4 banks from bits 2–3", () => {
    // CPE bit 4 = 0 (ext enabled). Bits 2–3 select the bank; the low bits
    // (OS/BASIC/self-test overlays on 0/1/7) are irrelevant to the ext bank.
    expect(decodeBankWindow(W, 0b1110_0001)).toMatchObject({ space: "bank0", bankOffset: 0x0000 });
    expect(decodeBankWindow(W, 0b1110_0101)).toMatchObject({ space: "bank1", bankOffset: 0x4000 });
    expect(decodeBankWindow(W, 0b1110_1001)).toMatchObject({ space: "bank2", bankOffset: 0x8000 });
    expect(decodeBankWindow(W, 0b1110_1101)).toMatchObject({ space: "bank3", bankOffset: 0xc000 });
  });

  it("reports no ext bank when the CPE gate is closed (bit 4 high)", () => {
    // Bit 4 = 1 → CPU sees main RAM, not the ext bank, regardless of bits 2–3.
    expect(decodeBankWindow(W, 0b0001_1101)).toMatchObject({ space: null, bankOffset: null });
  });

  it("carries the window bounds through", () => {
    expect(decodeBankWindow(W, 0)).toMatchObject({ window: "main", start: 0x4000, end: 0x7fff });
  });

  it("returns a null projection for a window with no selector", () => {
    const noSel: BankWindow = { id: "x", start: 0x4000, end: 0x7fff, bankCount: 2 };
    expect(decodeBankWindow(noSel, 0xff)).toEqual({
      window: "x", start: 0x4000, end: 0x7fff, space: null, bankOffset: null,
    });
  });

  it("defaults the space prefix to 'bank' when unset", () => {
    const noPrefix: BankWindow = { ...W, spacePrefix: undefined };
    expect(decodeBankWindow(noPrefix, 0b0000_0100).space).toBe("bank1");
  });
});
