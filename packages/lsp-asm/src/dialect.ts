// An AsmDialect profile parameterizes the generic assembly engine (./engine) for
// one assembler: its CPU opcode table, comment + label + equate + include +
// macro syntax, and directive vocabulary. `createAsmProvider(dialect)`
// (./provider) turns a profile into a @madside/lsp-core LanguageProvider. The
// engine itself knows no dialect — everything assembler-specific lives in these
// data profiles, so adding a target = adding a profile object (ADR-0009).

import type { CpuOpcodes } from './cpu'

export interface AsmDialect {
  /** Stable id, e.g. 'mads' | 'ca65' | 'z80asm'. Selects the dialect at runtime. */
  readonly id: string
  /** Opcode hint table for this assembler's CPU (hover / completion / modes). */
  readonly cpu: CpuOpcodes
  /** CPU register + condition names, excluded from symbol-reference detection
   *  and undefined-symbol diagnostics. Matched case-insensitively. */
  readonly registers: ReadonlySet<string>
  /** Line-comment marker(s), e.g. [';'] or [';', '//']. */
  readonly lineComment: readonly string[]
  /** Directive names (lowercase, WITHOUT any prefix). Used for completion +
   *  unknown-directive diagnostics + skipping the label scanner. */
  readonly directives: ReadonlySet<string>
  /** Prefix a directive carries in source, e.g. '.' for ca65 (`.segment`). '' if
   *  directives are written bare (mads, z80asm). */
  readonly directivePrefix: string
  /** True when the assembler folds case for symbols (mads). When false, labels
   *  are case-sensitive (ca65, z80asm). */
  readonly caseInsensitive: boolean
  /** True when a label definition is marked by a trailing ':' (ca65, z80asm).
   *  Bare column-0 labels (mads) are recognized regardless. */
  readonly labelColon: boolean
  /** Matches an equate/constant definition; capture group 1 = symbol name. */
  readonly equate: RegExp
  /** Matches a source include; capture group 1 = the quoted path. */
  readonly include: RegExp
  /** Matches a macro-definition start; capture group 1 = macro name. */
  readonly macroStart: RegExp
  /** Matches a macro-definition end. */
  readonly macroEnd: RegExp
  /** `source` tag for the engine's analysis diagnostics (e.g. 'mads-asm'). */
  readonly diagnosticSource: string
  /** `source` tag for parsed build-output diagnostics (e.g. 'mads'). */
  readonly buildDiagnosticSource: string
  /** Custom JSON-RPC notification the host pushes raw build output on. Omit to
   *  disable the build-diagnostics channel. */
  readonly buildOutputNotification?: string
}
