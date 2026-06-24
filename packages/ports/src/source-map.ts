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
}
