import { useEffect, useMemo } from "react";
import type { SourceMap } from "@adapters/wasm-mads/sourceMap";

export interface CursorHighlight {
  start: number;
  len: number;
}

interface Args {
  sourceMap: SourceMap | null;
  activeBase: string;
  cursorLine: number | null;
  memBaseTouched: boolean;
  setMemBase: (addr: number) => void;
}

/** Track the byte range the editor cursor's source line emits, and
 *  auto-scroll the memory view to follow it (until the user touches the
 *  base manually).
 *
 *  MADS `.lst` only lists the first few bytes per source line for `dta`
 *  / multi-byte data, so neither `addrToLoc` (per-byte map) nor
 *  `locToAddr` (line-start map) alone covers the full range — combine
 *  both. */
export function useCursorMemory({
  sourceMap, activeBase, cursorLine, memBaseTouched, setMemBase,
}: Args): CursorHighlight | null {
  const highlight = useMemo<CursorHighlight | null>(() => {
    if (!sourceMap || cursorLine == null) return null;
    const fileMap = sourceMap.locToAddr.get(activeBase);
    if (!fileMap) return null;
    const entries = [...fileMap.entries()].sort((a, b) => a[0] - b[0]);
    const idx = entries.findIndex(([line]) => line >= cursorLine);
    if (idx < 0) return null;
    if (entries[idx][0] !== cursorLine && idx === 0) return null;
    const cur = entries[idx];
    const next = entries[idx + 1];
    const start = cur[1];
    let countFromMap = 0;
    for (const [addr, loc] of sourceMap.addrToLoc) {
      if (loc.file === activeBase && loc.line === cur[0] &&
          addr >= start && addr - start < 256) countFromMap++;
    }
    const countFromNext = next ? next[1] - start : 0;
    const len = Math.max(1, countFromMap, countFromNext);
    return { start, len };
  }, [sourceMap, cursorLine, activeBase]);

  useEffect(() => {
    if (memBaseTouched || highlight == null) return;
    setMemBase(highlight.start & 0xff80);   // align to 128-byte page
  }, [highlight, memBaseTouched, setMemBase]);

  return highlight;
}
