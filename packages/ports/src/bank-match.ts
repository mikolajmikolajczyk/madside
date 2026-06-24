// Bank-aware breakpoint matching (ADR-0014). Pure helpers shared by the
// Emulator run loop and tests — given a backend's live bankMap() projection,
// decide whether a breakpoint fires at the current PC. A cpu-space breakpoint
// (bare number) fires on PC match; a BankBreakpoint fires only when the live
// bank in its window matches one of its required banks (the FCEUX-style
// live-bank predicate).

import type { BankBreakpoint, BankProjection } from "./services/run-service";

/** Live bank space mapped at a CPU address, from a bankMap() projection, or
 *  null when pc is outside every window (or the window has no ext bank). */
export function liveSpaceAt(bankMap: readonly BankProjection[], pc: number): string | null {
  for (const w of bankMap) if (pc >= w.start && pc <= w.end) return w.space;
  return null;
}

export interface SplitBreakpoints {
  /** cpu-space breakpoint addresses (fire on PC match). */
  cpuAddrs: Set<number>;
  /** addr → the set of banks a breakpoint there requires (any may match). */
  bankReqByAddr: Map<number, Set<string>>;
}

/** Split a mixed breakpoint set into cpu-space addrs + per-addr required banks. */
export function splitBreakpoints(bps: Iterable<number | BankBreakpoint>): SplitBreakpoints {
  const cpuAddrs = new Set<number>();
  const bankReqByAddr = new Map<number, Set<string>>();
  for (const bp of bps) {
    if (typeof bp === "number") { cpuAddrs.add(bp & 0xffff); continue; }
    const a = bp.addr & 0xffff;
    const set = bankReqByAddr.get(a) ?? new Set<string>();
    set.add(bp.space);
    bankReqByAddr.set(a, set);
  }
  return { cpuAddrs, bankReqByAddr };
}

/** Whether a breakpoint fires at `pc` given the live bank map. A wrong-bank stop
 *  returns false → the run loop resumes. */
export function breakpointFires(
  pc: number,
  { cpuAddrs, bankReqByAddr }: SplitBreakpoints,
  bankMap: readonly BankProjection[] | undefined,
): boolean {
  if (cpuAddrs.has(pc)) return true;
  const req = bankReqByAddr.get(pc);
  if (!req || !bankMap) return false;
  const live = liveSpaceAt(bankMap, pc);
  return live != null && req.has(live);
}
