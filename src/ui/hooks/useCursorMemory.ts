import { useEffect, useMemo } from "react";
import type { SourceMap } from "@ports";

/** Memory view aligns the visible window to 128-byte pages — same boundary
 *  ANTIC display lists use for character data. Mask = page size - 1, inverted. */
const MEMORY_VIEW_PAGE_MASK = 0xff80;

export interface CursorHighlight {
  start: number;
  len: number;
}

interface Args {
  sourceMap: SourceMap | null;
  /** Full project path of the active file (matches SourceMap keys post-30be0cf). */
  activePath: string;
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
  sourceMap, activePath, cursorLine, memBaseTouched, setMemBase,
}: Args): CursorHighlight | null {
  const highlight = useMemo<CursorHighlight | null>(() => {
    if (!sourceMap || cursorLine == null) return null;
    const fileMap = sourceMap.locToAddr.get(activePath);
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
      if (loc.file === activePath && loc.line === cur[0] &&
          addr >= start && addr - start < 256) countFromMap++;
    }
    const countFromNext = next ? next[1] - start : 0;
    const len = Math.max(1, countFromMap, countFromNext);
    return { start, len };
  }, [sourceMap, cursorLine, activePath]);

  useEffect(() => {
    if (memBaseTouched || highlight == null) return;
    setMemBase(highlight.start & MEMORY_VIEW_PAGE_MASK);
  }, [highlight, memBaseTouched, setMemBase]);

  return highlight;
}
