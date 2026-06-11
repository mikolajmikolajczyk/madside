import { useMemo } from "react";
// eslint-disable-next-line boundaries/element-types -- TODO(M3): service extraction lifts this import into a service call
import type { SourceMap } from "@adapters/wasm-mads";
import { basename } from "@core/path";

/** Translate a per-file map of source breakpoint lines into a flat set
 *  of PC addresses, using the most recent assemble's source map. Lines
 *  that don't directly emit code (label-only, blank, comment) fall
 *  through to the next emitting line in the same file. */
export function useBreakpointAddrs(
  sourceMap: SourceMap | null,
  bpLinesByFile: Map<string, Set<number>>,
): Set<number> {
  return useMemo(() => {
    const addrs = new Set<number>();
    if (!sourceMap) return addrs;
    for (const [file, lines] of bpLinesByFile) {
      const fileMap = sourceMap.locToAddr.get(basename(file));
      if (!fileMap) continue;
      let sorted: number[] | null = null;
      for (const line of lines) {
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
