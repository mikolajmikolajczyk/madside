import { useMemo } from "react";
import { resolveLineSpace, type BankBreakpoint, type SourceMap } from "@ports";

/** Translate a per-file map of source breakpoint lines into a flat set of
 *  breakpoints, using the most recent assemble's source map. Lines that don't
 *  directly emit code (label-only, blank, comment) fall through to the next
 *  emitting line in the same file.
 *
 *  When the toolchain provides `lineToAddrs` (cc65: a C line compiles to several
 *  non-contiguous ranges, #49), a breakpoint on the line traps at *every* one of
 *  them. Otherwise one line = one address (MADS), via `locToAddr`.
 *
 *  Banked lines (ADR-0014): when the source line was built into a bank, the
 *  breakpoint is emitted as a {@link BankBreakpoint} carrying that `space`, so
 *  the backend fires only when that bank is live. Flat lines stay bare numbers
 *  (the `cpu` space) — today's behavior verbatim. */
/** Pure resolution of source breakpoint lines → backend breakpoints. Exported
 *  for unit testing; the hook below is a `useMemo` wrapper. */
export function resolveBreakpoints(
  sourceMap: SourceMap | null,
  bpLinesByFile: Map<string, Set<number>>,
): Set<number | BankBreakpoint> {
  const out = new Set<number | BankBreakpoint>();
  if (!sourceMap) return out;
  const sm = sourceMap;
  // A line is added either as a bank-aware BP (line built into a bank) or a
  // bare cpu-space addr. The bank is a property of the (file, line), not the
  // addr — same addr can live in several banks.
  const add = (file: string, line: number, addr: number): void => {
    const space = resolveLineSpace(sm, file, line);
    out.add(space != null ? { addr, space } : addr);
  };
  for (const [file, lines] of bpLinesByFile) {
    // SourceMap keys are full project paths post-30be0cf — match BP file
    // paths verbatim. Avoids the same-basename collision that came up when
    // the project starts using lib/ with file names mirroring src/.
    const allMap = sm.lineToAddrs?.get(file);
    const fileMap = sm.locToAddr.get(file);
    if (!fileMap) continue;
    let sorted: number[] | null = null;
    for (const line of lines) {
      const all = allMap?.get(line);
      if (all && all.length > 0) {
        for (const a of all) add(file, line, a);
        continue;
      }
      let addr = fileMap.get(line);
      let resolvedLine = line;
      if (addr == null) {
        if (!sorted) sorted = [...fileMap.keys()].sort((a, b) => a - b);
        const next = sorted.find((l) => l > line);
        if (next != null) { addr = fileMap.get(next); resolvedLine = next; }
      }
      if (addr != null) add(file, resolvedLine, addr);
    }
  }
  return out;
}

export function useBreakpointAddrs(
  sourceMap: SourceMap | null,
  bpLinesByFile: Map<string, Set<number>>,
): Set<number | BankBreakpoint> {
  return useMemo(() => resolveBreakpoints(sourceMap, bpLinesByFile), [sourceMap, bpLinesByFile]);
}
