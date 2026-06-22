import type { CDialect } from '@madside/lsp-c'

// z88dk/sccz80 (Z80) C dialect. sccz80 decorates declarations with calling-
// convention + section macros (__z88dk_fastcall/__naked/fastcall/…) that the
// standard C grammar chokes on — blank them before parsing. Diagnostics:
// analysis source `z88dk-intel`, build source `z88dk` (sccz80/z80asm output,
// parsed by the engine). The host pushes raw z88dk build output on the
// `z88dk/buildOutput` notification.
export const z80Dialect: CDialect = {
  // z88dk decorates declarations heavily (__LIB__ 6k×, __smallc 4k×, the
  // __z88dk_* calling conventions, __sfr/__at port qualifiers, …) — blank them
  // so the C grammar parses the underlying declaration. __preserves_regs(...) and
  // __at(...) carry args, so consume their parens too.
  decorators:
    /\b(?:__LIB__|__smallc|__z88dk_fastcall|__z88dk_callee|__z88dk_params_offset|__z88dk_saveframe|__z88dk_sdccdecl|__vasmallc|__naked|__critical|__banked|__nonbanked|__sfr|__CALLEE__|__FASTCALL__|__stdc|fastcall|callee)\b|__preserves_regs\s*\([^)]*\)|__at\s*\([^)]*\)/g,
  diagnosticSource: 'z88dk-intel',
  buildDiagnosticSource: 'z88dk',
  buildOutputNotification: 'z88dk/buildOutput',
  completionTriggers: ['.', '>'],
  signatureTriggers: ['(', ','],
}
