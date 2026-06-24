// clownassembler (asm68k syntax, Motorola 68000 / Sega Genesis) dialect profile.
// Case-sensitive symbols; directives bare; mnemonics + data directives carry a
// size suffix (`move.w`, `dc.l`); labels marked with a trailing ':' (local labels
// start with '.'); equates via `equ` / `=` / `set`; includes via `include`;
// macros `NAME: macro` … `endm`. Addressing-mode validation is off — the 68000's
// effective-addressing operand forms are too varied to validate reliably.
import { M68000 } from '../cpu'
import { REG_M68K } from '../registers'
import type { AsmDialect } from '../dialect'

const DIRECTIVES = [
  'dc', 'dcb', 'ds', 'equ', 'set', 'org', 'rorg', 'even', 'align', 'cnop',
  'rept', 'endr', 'macro', 'endm', 'if', 'else', 'endif', 'elseif', 'endc',
  'include', 'incbin', 'section', 'rsset', 'rs', 'rsreset', 'obj', 'objend',
  'pushp', 'popp',
]

export const clownassemblerDialect: AsmDialect = {
  id: 'clownassembler',
  cpu: M68000,
  registers: REG_M68K,
  addressingModes: false,
  sizeSuffix: true,
  lineComment: [';'],
  directives: new Set(DIRECTIVES),
  directivePrefix: '',
  caseInsensitive: false,
  labelColon: true,
  equate: /^\s*(\.?\w+):?\s*(?:=|\bequ\b|\bset\b)/i,
  include: /\binclude\s+"([^"]+)"/i,
  macroStart: /^\s*(\.?\w+):?\s+macro\b/i,
  macroEnd: /^\s*endm\b/i,
  diagnosticSource: 'clownassembler-asm',
  buildDiagnosticSource: 'clownassembler',
  buildOutputNotification: 'clownassembler/buildOutput',
}
