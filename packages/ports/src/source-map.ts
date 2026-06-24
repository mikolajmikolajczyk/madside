// Source map shape produced by ToolchainPlugin output. Lifted into @ports so
// UI hooks (useBreakpointAddrs, useCursorMemory) can type against the contract
// without crossing @ui → @adapters.

export interface SourceLoc {
  file: string
  line: number
  /** Physical placement captured from the toolchain — banking-support groundwork
   *  (ADR-0014, Phase 0). `space` names the bank/segment the bytes live in;
   *  `offset` is their physical byte offset into that domain. Present ONLY for
   *  genuinely banked builds (a segment assigned a bank); flat builds omit both
   *  and behave exactly as before. **Unused until the bank-aware debugger lands**
   *  — captured here so the toolchains' bank info (cc65 `seg.bank`/`ooffs`, MADS
   *  virtual-bank column) isn't discarded. */
  space?: string
  offset?: number
}

export interface SourceMap {
  /** PC address → first source location that emits at that address. */
  addrToLoc: Map<number, SourceLoc>
  /** File path → (line number → first PC address). */
  locToAddr: Map<string, Map<number, number>>
  /** File path → (line number → every PC address that line emits at). Optional;
   *  cc65 C lines compile to multiple non-contiguous ranges, so a breakpoint on
   *  the line traps at all of them (#49). Absent for toolchains where one line =
   *  one address (MADS) — those rely on `locToAddr`. */
  lineToAddrs?: Map<string, Map<number, number[]>>
  /** Banked builds only (ADR-0014 Phase 1). PC address → **every** SourceLoc
   *  that emits at it across banks. `addrToLoc` keeps only the first (so flat
   *  behavior is untouched); this keeps them all, so same-address lines in
   *  different banks can be disambiguated — by the live bank (current-line
   *  highlight) or by `(file, line)` (breakpoint → which bank a source line is
   *  in). Absent for flat builds; populated only for entries carrying a
   *  `SourceLoc.space`. Use {@link resolvePcLoc} / {@link resolveLineSpace}. */
  bankedAddrToLoc?: Map<number, SourceLoc[]>
}

/** Resolve a PC to its source location, disambiguating banked code by the live
 *  bank (ADR-0014). When `liveSpace` names the bank currently mapped at `pc` and
 *  the build has banked entries there, return the matching loc; otherwise fall
 *  back to the first-wins `addrToLoc` (flat behavior). */
export function resolvePcLoc(
  sm: SourceMap,
  pc: number,
  liveSpace?: string | null,
): SourceLoc | undefined {
  if (liveSpace) {
    const locs = sm.bankedAddrToLoc?.get(pc)
    const hit = locs?.find((l) => l.space === liveSpace)
    if (hit) return hit
  }
  return sm.addrToLoc.get(pc)
}

/** The bank a source line was built into (its `SourceLoc.space`), or undefined
 *  for a flat line. Used to turn a `(file, line)` breakpoint into a bank-aware
 *  one (ADR-0014). A source line assembles into exactly one bank, so the first
 *  banked loc matching `(file, line)` is authoritative. */
export function resolveLineSpace(
  sm: SourceMap,
  file: string,
  line: number,
): string | undefined {
  if (!sm.bankedAddrToLoc) return undefined
  for (const locs of sm.bankedAddrToLoc.values()) {
    for (const l of locs) {
      if (l.file === file && l.line === line && l.space) return l.space
    }
  }
  return undefined
}
