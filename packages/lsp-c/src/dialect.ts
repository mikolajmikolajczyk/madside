// A CDialect profile parameterizes the generic C engine (./engine) for one C
// toolchain: which calling-convention decorators to blank before parsing, the
// diagnostic `source` strings, the build-output notification channel, and the
// editor trigger characters. `createCProvider(dialect)` (./provider) turns a
// profile into a @madside/lsp-core LanguageProvider. The engine itself knows no
// dialect — everything dialect-specific lives here (ADR-0009).

import type { ExtraDecls } from './engine'

export interface CDialect {
  /** Calling-convention macros blanked (offset-preserving) before parsing, so a
   *  declaration carrying one still indexes. cc65: `__fastcall__`/`__cdecl__`.
   *  Omit for plain C. */
  decorators?: RegExp
  /** `source` tag for the engine's analysis diagnostics (e.g. 'cc65-intel'). */
  diagnosticSource: string
  /** `source` tag for parsed build-output diagnostics (e.g. 'cc65'). */
  buildDiagnosticSource: string
  /** Custom JSON-RPC notification the host pushes raw build output on. Omit to
   *  disable the build-diagnostics channel. */
  buildOutputNotification?: string
  /** Completion trigger characters. Defaults to `['.', '>']` (member access). */
  completionTriggers?: string[]
  /** Signature-help trigger characters. Defaults to `['(', ',']`. */
  signatureTriggers?: string[]
  /** Extractor for functions the C grammar can't see because they're declared
   *  via a macro (z88dk's `__ZPROTO*(...)` prototypes). Returns each function so
   *  the engine indexes it alongside the parsed declarations. Omit for plain C. */
  extraDecls?: ExtraDecls
}
