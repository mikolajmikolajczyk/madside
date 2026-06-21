import { parser } from '@lezer/cpp'
import type { Tree } from '@lezer/common'

// The parse layer. @lezer/cpp is a real C/C++ grammar (the parser behind
// CodeMirror's lang-cpp) — a pure, dependency-light tree producer, NOT an
// editor. cc65 is close enough to C that the declarations we care about
// (structs, typedefs, variable declarations) parse cleanly; dialect-only
// constructs degrade to error nodes locally without breaking the surrounding
// tree. We build the cc65-aware index on top of this tree (no regex).

// Some C dialects decorate functions with a calling-convention macro
// (cc65: `void __fastcall__ cputs (const char*);`). @lezer/cpp doesn't know
// these are macros, so it mis-parses the declaration and the function never gets
// indexed. The dialect supplies a `decorators` regex (cc65's
// `__fastcall__`/`__cdecl__`); each match is blanked out with EQUAL-LENGTH
// whitespace before parsing so every downstream offset (member resolution,
// ranges, hover) stays valid. The generic default blanks nothing.
export const stripDecorators = (text: string, decorators?: RegExp): string =>
  decorators ? text.replace(decorators, (m) => ' '.repeat(m.length)) : text

/** Parse C source into a Lezer syntax tree. `decorators`, when given, blanks
 *  dialect calling-convention macros before parsing (see `stripDecorators`). */
export function parseC(text: string, decorators?: RegExp): Tree {
  return parser.parse(stripDecorators(text, decorators))
}
