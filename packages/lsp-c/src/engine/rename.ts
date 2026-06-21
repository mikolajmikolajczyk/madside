import type { CRenameEdit, SourceFile } from './types'
import { wordAt } from './ast'
import { referencesAt } from './references'

// Rename, built on find-references: every reference to the identifier under the
// cursor becomes an edit to `newName`. Inherits references' name-based,
// scope-blind heuristic (see references.ts) — same-named tokens in unrelated
// scopes are rewritten too, the documented limitation.

/** Edits that rename the identifier under `offset` to `newName` across `files`.
 *  Empty when the cursor isn't on an identifier. */
export function renameAt(
  files: SourceFile[],
  text: string,
  offset: number,
  newName: string,
  decorators?: RegExp,
): CRenameEdit[] {
  return referencesAt(files, text, offset, decorators).map((r) => ({
    uri: r.uri,
    start: r.start,
    end: r.end,
    newText: newName,
  }))
}

/** The offset range of the identifier under `offset` (what an editor highlights
 *  when prompting for the new name), or null if the cursor isn't on one. */
export function prepareRenameAt(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  const w = wordAt(text, offset)
  return w ? { start: w.from, end: w.to } : null
}
