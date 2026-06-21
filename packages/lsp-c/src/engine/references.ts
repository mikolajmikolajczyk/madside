import type { CLocation, SourceFile } from './types'
import { parseC } from './parse'
import { slice, walk, wordAt } from './ast'

// Find-references across a set of files. Name-based and scope-blind: every
// `Identifier` / `FieldIdentifier` token whose text equals the target name is a
// hit, in every file. This is the documented heuristic — cc65 C has no
// overloading, but a local `x`, a global `x`, and a field `.x` all match, so a
// reference set can over-include same-named tokens from unrelated scopes. Good
// enough for jump-around + rename (#24); precise scoping is a later refinement.

/** Every occurrence of identifier `name` across `files`, as locations
 *  (file path + offset range). */
export function findReferences(
  files: SourceFile[],
  name: string,
  decorators?: RegExp,
): CLocation[] {
  const out: CLocation[] = []
  for (const f of files) {
    const root = parseC(f.text, decorators).topNode
    walk(root, (n) => {
      if ((n.name === 'Identifier' || n.name === 'FieldIdentifier') && slice(f.text, n) === name) {
        out.push({ uri: f.path, start: n.from, end: n.to })
      }
    })
  }
  return out
}

/** References to the identifier under `offset` in the active buffer, searched
 *  across all `files` (the active buffer must be one of them). Empty when the
 *  cursor isn't on an identifier. */
export function referencesAt(
  files: SourceFile[],
  text: string,
  offset: number,
  decorators?: RegExp,
): CLocation[] {
  const word = wordAt(text, offset)
  return word ? findReferences(files, word.word, decorators) : []
}
