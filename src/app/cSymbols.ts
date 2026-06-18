// Heuristic C symbol scanner (#58). Pulls top-level definitions out of a C
// source/header so the editor can complete a project's own functions / macros /
// types across files — the C analogue of the assembly label index
// (`@app/labels` scanFile). Regex, not a full parse: cc65 projects are small and
// full clangd-style analysis is out of scope (per #48). CodeMirror-free so @ui
// can build the index without pulling the editor lib into the eager bundle.

export type CSymbolKind = 'function' | 'macro' | 'type' | 'global'

export interface CSymbol {
  /** Identifier as typed. */
  label: string
  kind: CSymbolKind
  /** Project file the symbol was found in (basename), surfaced in hover. */
  file: string
}

// Keywords that look like identifiers in the scan but aren't completable defs.
const C_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'sizeof',
  'void', 'char', 'int', 'long', 'short', 'unsigned', 'signed', 'const',
  'static', 'struct', 'union', 'enum', 'typedef', 'extern', 'register',
  'volatile', 'float', 'double', 'goto', 'break', 'continue', 'default',
])

/** Scan a C buffer for the user's own top-level symbols: function definitions /
 *  prototypes, `#define`s, and `typedef`d type names. First definition of a
 *  given name wins (the caller dedups across files). Heuristic — favours
 *  precision (anchored at column 0) over catching every edge case. */
export function scanCSymbols(text: string, file: string): CSymbol[] {
  const out = new Map<string, CSymbolKind>() // name → kind, first wins

  // Function definitions / prototypes at top level: a return type, the name,
  // a parenthesised arg list, then `{` (def) or `;` (proto). Anchored at the
  // line start so indented *calls* inside a body aren't mistaken for defs.
  for (const m of text.matchAll(/^[A-Za-z_][\w\s*]*?\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*[;{]/gm)) {
    const name = m[1]!
    if (!C_KEYWORDS.has(name) && !out.has(name)) out.set(name, 'function')
  }
  // #define NAME
  for (const m of text.matchAll(/^[ \t]*#\s*define\s+([A-Za-z_]\w*)/gm)) {
    if (!out.has(m[1]!)) out.set(m[1]!, 'macro')
  }
  // typedef <type> Name;  (no braces) and  typedef struct {...} Name;
  for (const m of text.matchAll(/\btypedef\b[^;{}]*\b([A-Za-z_]\w*)\s*;/g)) {
    if (!C_KEYWORDS.has(m[1]!)) out.set(m[1]!, 'type')
  }
  for (const m of text.matchAll(/}\s*([A-Za-z_]\w*)\s*;/g)) {
    if (!C_KEYWORDS.has(m[1]!) && !out.has(m[1]!)) out.set(m[1]!, 'type')
  }

  return [...out].map(([label, kind]) => ({ label, kind, file }))
}
