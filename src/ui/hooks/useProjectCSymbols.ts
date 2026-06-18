import { useMemo } from "react";
import { scanCSymbols, type CSymbol } from "@app/cSymbols";
import { basename } from "@core/path";

interface ProjectFile {
  path: string;
  content: Uint8Array;
}

// Per-file scan cache keyed by file-content identity. Module scope (not a ref)
// so it persists across renders without a render-time ref access (Rules of
// React / React Compiler, #28). A WeakMap entry GCs once its byte array is
// dropped. Mirrors useProjectLabels' scanCache.
const scanCache = new WeakMap<Uint8Array, CSymbol[]>();

function scanCached(content: Uint8Array, base: string): CSymbol[] {
  let syms = scanCache.get(content);
  if (!syms) {
    syms = scanCSymbols(new TextDecoder().decode(content), base);
    scanCache.set(content, syms);
  }
  return syms;
}

/** Project-wide C symbol index (#58): every `.c`/`.h` file scanned for its
 *  top-level functions / macros / types so the C editor can complete a symbol
 *  defined in `helper.c` while editing `main.c` — the C analogue of
 *  useProjectLabels. First definition of a name wins. Cached by file content,
 *  so typing only rescans the file that changed. */
export function useProjectCSymbols(files: ProjectFile[] | null): Map<string, CSymbol> {
  return useMemo<Map<string, CSymbol>>(() => {
    const out = new Map<string, CSymbol>();
    if (files) {
      for (const f of files) {
        if (!/\.(c|h|cc|cpp|hpp)$/i.test(f.path)) continue;
        for (const sym of scanCached(f.content, basename(f.path))) {
          if (!out.has(sym.label)) out.set(sym.label, sym);
        }
      }
    }
    return out;
  }, [files]);
}
