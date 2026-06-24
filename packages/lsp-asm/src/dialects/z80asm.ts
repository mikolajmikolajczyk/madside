// z80asm (z88dk's assembler, Z80 / ZX Spectrum) dialect profile. Case-sensitive
// symbols; directives written bare; labels marked with a trailing ':'; equates
// via `equ` / `=` / `defc NAME = …`; includes via `include`; macros
// `NAME macro` … `endm`. Banking uses `SECTION BANK_n` (see z80asm-debug).
import { Z80 } from '../cpu'
import { REG_Z80 } from '../registers'
import type { AsmDialect } from '../dialect'

const DIRECTIVES = [
  'org', 'defb', 'db', 'defw', 'dw', 'defs', 'ds', 'defm', 'defc', 'equ',
  'include', 'incbin', 'binary', 'module', 'section', 'public', 'extern',
  'global', 'macro', 'endm', 'rept', 'endr', 'if', 'else', 'endif', 'ifdef',
  'ifndef', 'align', 'end',
]

export const z80asmDialect: AsmDialect = {
  id: 'z80asm',
  cpu: Z80,
  registers: REG_Z80,
  addressingModes: false,
  sizeSuffix: false,
  lineComment: [';'],
  directives: new Set(DIRECTIVES),
  directivePrefix: '',
  caseInsensitive: false,
  labelColon: true,
  // `name equ v`, `name = v`, or `defc name = v` — capture the symbol name.
  equate: /^\s*(?:defc\s+)?(\w+):?\s*(?:=|\bequ\b)/i,
  include: /\binclude\s+"([^"]+)"/i,
  macroStart: /^\s*(\w+):?\s+macro\b/i,
  macroEnd: /^\s*endm\b/i,
  diagnosticSource: 'z80asm',
  buildDiagnosticSource: 'z88dk',
  buildOutputNotification: 'z88dk/buildOutput',
}
