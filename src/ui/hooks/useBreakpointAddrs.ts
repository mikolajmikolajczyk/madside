import { useMemo } from "react";
import type { SourceMap } from "@ports";

/** Translate a per-file map of source breakpoint lines into a flat set
 *  of PC addresses, using the most recent assemble's source map. Lines
 *  that don't directly emit code (label-only, blank, comment) fall
 *  through to the next emitting line in the same file.
 *
 *  When the toolchain provides `lineToAddrs` (cc65: a C line compiles to several
 *  non-contiguous ranges, #49), a breakpoint on the line traps at *every* one of
 *  them. Otherwise one line = one address (MADS), via `locToAddr`. */
export function useBreakpointAddrs(
  sourceMap: SourceMap | null,
  bpLinesByFile: Map<string, Set<number>>,
): Set<number> {
  return useMemo(() => {
    const addrs = new Set<number>();
    if (!sourceMap) return addrs;
    for (const [file, lines] of bpLinesByFile) {
      // SourceMap keys are full project paths post-30be0cf — match BP file
      // paths verbatim. Avoids the same-basename collision that came up when
      // the project starts using lib/ with file names mirroring src/.
      const allMap = sourceMap.lineToAddrs?.get(file);
      const fileMap = sourceMap.locToAddr.get(file);
      if (!fileMap) continue;
      let sorted: number[] | null = null;
      for (const line of lines) {
        const all = allMap?.get(line);
        if (all && all.length > 0) {
          for (const a of all) addrs.add(a);
          continue;
        }
        let addr = fileMap.get(line);
        if (addr == null) {
          if (!sorted) sorted = [...fileMap.keys()].sort((a, b) => a - b);
          const next = sorted.find((l) => l > line);
          if (next != null) addr = fileMap.get(next);
        }
        if (addr != null) addrs.add(addr);
      }
    }
    return addrs;
  }, [sourceMap, bpLinesByFile]);
}
