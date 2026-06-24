// Engine data model. The index is a flat project-wide symbol table: every label,
// equate, and macro definition plus every reference, keyed by normalized name.
// Cross-file resolution is implicit — `update` indexes ALL open project files
// together, so an include-defined label resolves from any file that includes it
// (matching how the label scanner already works), without modelling the include
// graph.

import type { SourceFile } from '@madside/lsp-core'

export type AsmSymbolKind = 'label' | 'equate' | 'macro'

/** A symbol definition site. */
export interface AsmDef {
  /** Name as written (preserves case; the index key is normalized). */
  name: string
  kind: AsmSymbolKind
  uri: string
  /** Offset span of the name token within the file. */
  start: number
  end: number
  /** 1-based line of the definition (for hover preview / outline). */
  line: number
  /** Equate value text (the right-hand side), when kind === 'equate'. */
  value?: string
}

/** A symbol reference site (in an operand, a macro call, or an equate value). */
export interface AsmRef {
  name: string
  uri: string
  start: number
  end: number
  /** True for a mnemonic-slot (macro/pseudo-op) reference — excluded from the
   *  undefined-symbol diagnostic. */
  mnemonic?: boolean
}

export interface AsmIndex {
  /** normalized name → definitions (>1 ⇒ duplicate-definition diagnostic). */
  defs: Map<string, AsmDef[]>
  /** normalized name → all references. */
  refs: Map<string, AsmRef[]>
  /** uri → the file's own defs + refs (document symbols, diagnostics). */
  byUri: Map<string, { defs: AsmDef[]; refs: AsmRef[] }>
  /** uri → source text (live copy at last update). */
  files: Map<string, SourceFile>
}

export function emptyIndex(): AsmIndex {
  return { defs: new Map(), refs: new Map(), byUri: new Map(), files: new Map() }
}
