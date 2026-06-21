// Build diagnostics (#29). Structured, toolchain-parsed error/warning locations
// so the editor can mark offending lines inline (red squiggle + gutter + hover).
// The toolchain plugin owns the parse of its own output (MADS first; ca65 later)
// — the workbench never sees raw assembler text, same contract as sourceMap /
// labels.

export interface BuildDiagnostic {
  /** Project-relative path of the source file the diagnostic points at. */
  file: string
  /** 1-based source line. */
  line: number
  /** 1-based column, when the toolchain reports one. */
  column?: number
  severity: 'error' | 'warning'
  message: string
}
