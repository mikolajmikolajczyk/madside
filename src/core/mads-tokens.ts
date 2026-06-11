// MADS lexical vocabulary + label metadata shape. Lives in @core because both
// @ui (CodeMirror language definition) and @app (label scanner) need it, and
// per ADR-0002 those layers may not import each other.

export const MADS_OPCODES = new Set<string>([
  'ADC', 'AND', 'ASL', 'BCC', 'BCS', 'BEQ', 'BIT', 'BMI', 'BNE', 'BPL', 'BRK', 'BVC', 'BVS',
  'CLC', 'CLD', 'CLI', 'CLV', 'CMP', 'CPX', 'CPY', 'DEC', 'DEX', 'DEY', 'EOR', 'INC', 'INX',
  'INY', 'JMP', 'JSR', 'LDA', 'LDX', 'LDY', 'LSR', 'NOP', 'ORA', 'PHA', 'PHP', 'PLA', 'PLP',
  'ROL', 'ROR', 'RTI', 'RTS', 'SBC', 'SEC', 'SED', 'SEI', 'STA', 'STX', 'STY', 'TAX', 'TAY',
  'TSX', 'TXA', 'TXS', 'TYA',
])

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
