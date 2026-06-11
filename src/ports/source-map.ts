// Source map shape produced by ToolchainPlugin output. Lifted into @ports so
// UI hooks (useBreakpointAddrs, useCursorMemory) can type against the contract
// without crossing @ui → @adapters.

export interface SourceLoc {
  file: string
  line: number
}

export interface SourceMap {
  /** PC address → first source location that emits at that address. */
  addrToLoc: Map<number, SourceLoc>
  /** File basename → (line number → first PC address). */
  locToAddr: Map<string, Map<number, number>>
}
