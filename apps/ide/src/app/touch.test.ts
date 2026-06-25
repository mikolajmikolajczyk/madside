import { afterEach, describe, expect, it, vi } from "vitest";
import { isTouchPrimary } from "./touch";

// Headless node (no DOM env) — stub the two globals isTouchPrimary reads.
function mockEnv(coarse: boolean, maxTouchPoints: number): void {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: q.includes("coarse") ? coarse : false }),
  });
  vi.stubGlobal("navigator", { maxTouchPoints });
}

describe("isTouchPrimary (#144)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true for a coarse pointer with touch points (tablet)", () => {
    mockEnv(true, 5);
    expect(isTouchPrimary()).toBe(true);
  });

  it("is false for a fine pointer even with a touchscreen (2-in-1 + mouse)", () => {
    // Capability, not UA: a touchscreen laptop whose primary pointer is the
    // trackpad stays on desktop behaviour.
    mockEnv(false, 10);
    expect(isTouchPrimary()).toBe(false);
  });

  it("is false on a plain desktop (no touch points)", () => {
    mockEnv(false, 0);
    expect(isTouchPrimary()).toBe(false);
  });
});
