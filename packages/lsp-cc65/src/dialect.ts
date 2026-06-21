import type { CDialect } from '@madside/lsp-c'

// cc65 (6502) C dialect. cc65 decorates functions with calling-convention macros
// (__fastcall__/__cdecl__) that the standard C grammar chokes on — blank them
// before parsing. Diagnostics: analysis source `cc65-intel`, build source `cc65`
// (gcc/cc65-native output, parsed by the engine). The host pushes raw cc65/ca65/
// ld65 output on the `cc65/buildOutput` notification.
export const cc65Dialect: CDialect = {
  decorators: /\b(?:__fastcall__|__cdecl__)\b/g,
  diagnosticSource: 'cc65-intel',
  buildDiagnosticSource: 'cc65',
  buildOutputNotification: 'cc65/buildOutput',
  completionTriggers: ['.', '>'],
  signatureTriggers: ['(', ','],
}
