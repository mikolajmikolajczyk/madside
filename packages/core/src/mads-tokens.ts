// MADS directive vocabulary + label metadata shape. Lives in @core because
// both @ui (CodeMirror language definition) and @app (label scanner) need it,
// and per ADR-0002 those layers may not import each other.
//
// The 6502 opcode set + docs moved to @core/cpu/mos6502 (epic 78b12bf) — those
// are CPU-level, shared across assemblers; what's left here is MADS-specific
// (directives) until the toolchain-language work folds it into the MADS plugin.

export const MADS_DIRECTIVES = new Set<string>([
  'ORG', 'EQU', 'DTA', 'ICL', 'INS', 'RUN', 'END', 'OPT', 'RMB', 'SET', 'BLK', 'RPT', 'ERT',
  'MACRO', 'ENDM', 'PROC', 'ENDP', 'STRUCT', 'ENDS', 'SMB', 'LOCAL', 'ELS', 'EIF',
])

export interface LabelInfo {
  addr?: number
  file?: string
  line?: number
  preview?: string
  doc?: string
}
