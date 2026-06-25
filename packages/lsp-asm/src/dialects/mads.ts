// MADS (Mad-Assembler, 6502 / Atari) dialect profile. Case-insensitive; labels
// are bare in column 0 (a trailing ':' is also accepted); includes via `icl`;
// equates via `EQU` or `=`; macros `.macro NAME` … `.endm`.
import { MOS6502 } from '../cpu'
import { MADS_EXTRAS } from '../cpu/mads-extras'
import { REG_6502 } from '../registers'
import type { AsmDialect } from '../dialect'

const DIRECTIVES = [
  'org', 'equ', 'dta', 'icl', 'ins', 'run', 'end', 'opt', 'rmb', 'set', 'blk',
  'rpt', 'ert', 'macro', 'endm', 'proc', 'endp', 'struct', 'ends', 'smb',
  'local', 'els', 'eif', 'if', 'else', 'endif', 'byte', 'word',
]

export const madsDialect: AsmDialect = {
  id: 'mads',
  cpu: MOS6502,
  extras: MADS_EXTRAS,
  registers: REG_6502,
  addressingModes: true,
  sizeSuffix: false,
  lineComment: [';', '//'],
  directives: new Set(DIRECTIVES),
  directivePrefix: '',
  // `opt` takes compiler-option flags (`opt h-`, `opt f+`), not symbols.
  rawOperandDirectives: new Set(['opt']),
  caseInsensitive: true,
  labelColon: false,
  equate: /^\s*(\w+)\s*(?:=|\bequ\b)/i,
  include: /\bicl\s+"([^"]+)"/i,
  macroStart: /^\s*\.?macro\s+(\w+)/i,
  macroEnd: /^\s*\.?endm\b/i,
  diagnosticSource: 'mads-asm',
  buildDiagnosticSource: 'mads',
  buildOutputNotification: 'mads/buildOutput',
}
