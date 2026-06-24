// Assembly dialect registry. A dialect is pure data (CPU table + syntax rules +
// directive vocab), so all three live in this one package and are selected by id
// at runtime — unlike the C LSP's per-dialect packages, this keeps "add a target"
// down to adding a profile object here (ADR-0009 note).

import { madsDialect } from './mads'
import { ca65Dialect } from './ca65'
import { z80asmDialect } from './z80asm'
import type { AsmDialect } from '../dialect'

export { madsDialect } from './mads'
export { ca65Dialect } from './ca65'
export { z80asmDialect } from './z80asm'

const REGISTRY: Record<string, AsmDialect> = {
  mads: madsDialect,
  ca65: ca65Dialect,
  z80asm: z80asmDialect,
}

/** All known dialect ids. */
export const ASM_DIALECTS = Object.keys(REGISTRY)

/** Resolve an assembly dialect by id, or undefined if unknown. */
export function getAsmDialect(id: string): AsmDialect | undefined {
  return REGISTRY[id]
}
