// ca65 (cc65's assembler, 6502 / NES / C64 / Atari) dialect profile.
// Case-sensitive symbols; directives carry a '.' prefix (`.segment`, `.macro`);
// labels marked with a trailing ':'; equates via `=` / `:=`; includes via
// `.include`; macros `.macro NAME` … `.endmacro` (or `.mac` … `.endmac`).
import { MOS6502 } from '../cpu'
import { REG_6502 } from '../registers'
import type { AsmDialect } from '../dialect'

const DIRECTIVES = [
  'segment', 'code', 'data', 'bss', 'rodata', 'zeropage', 'org', 'reloc',
  'proc', 'endproc', 'scope', 'endscope', 'macro', 'endmacro', 'mac', 'endmac',
  'struct', 'endstruct', 'union', 'endunion', 'enum', 'endenum', 'byte', 'word',
  'dword', 'addr', 'res', 'asciiz', 'dbyt', 'import', 'importzp', 'export',
  'exportzp', 'global', 'globalzp', 'include', 'incbin', 'if', 'ifdef', 'ifndef',
  'ifblank', 'ifnblank', 'else', 'elseif', 'endif', 'repeat', 'endrepeat',
  'define', 'set', 'assert',
]

export const ca65Dialect: AsmDialect = {
  id: 'ca65',
  cpu: MOS6502,
  registers: REG_6502,
  addressingModes: true,
  lineComment: [';'],
  directives: new Set(DIRECTIVES),
  directivePrefix: '.',
  caseInsensitive: false,
  labelColon: true,
  equate: /^\s*(\w+)\s*:?=\s*\S/,
  include: /\.include\s+"([^"]+)"/i,
  macroStart: /\.mac(?:ro)?\s+(\w+)/i,
  macroEnd: /\.endmac(?:ro)?\b/i,
  diagnosticSource: 'ca65-asm',
  buildDiagnosticSource: 'ca65',
  buildOutputNotification: 'ca65/buildOutput',
}
