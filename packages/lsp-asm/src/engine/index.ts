export { buildIndex } from './index-asm'
export { emptyIndex, type AsmIndex, type AsmDef, type AsmRef, type AsmSymbolKind } from './types'
export { parseLine, wordAt, normalize, type SemKind, type SemTok, type ParsedLine } from './tokenize'
export {
  SEM_LEGEND,
  definitionAt,
  referencesAt,
  prepareRenameAt,
  renameAt,
  hoverAt,
  completeAt,
  outline,
  diagnoseFile,
  semanticTokensFor,
} from './queries'
