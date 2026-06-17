import { useEffect, useState } from "react";
import { useWorkbench } from "@app";

const EMPTY: Map<number, number> = new Map();

// Cap the number of equates we poll so a file with hundreds of `=` lines can't
// turn every step into hundreds of wasm reads. The first N (top of file) win.
const MAX_EQUATES = 64;

/** Live byte values for the editor's address equates (#34). Given a map of
 *  `line → address` (from `scanEquates` over the active file), returns
 *  `line → current byte` at that address, refreshed on the same debug events
 *  the Memory panel uses (`debug:step-done` / `debug:bp-hit` / `run:state`).
 *
 *  Gated on a live DebugTarget — no backend means an empty map, so nothing is
 *  rendered when not debugging, and values clear on stop. */
export function useEquateValues(equates: Map<number, number>): Map<number, number> {
  const wb = useWorkbench();
  const [values, setValues] = useState<Map<number, number>>(EMPTY);

  useEffect(() => {
    if (equates.size === 0) {
      setValues(EMPTY);
      return;
    }
    const entries = [...equates].slice(0, MAX_EQUATES);
    let cancelled = false;

    const refresh = async () => {
      if (!wb.debug.target()) {
        if (!cancelled) setValues(EMPTY);
        return;
      }
      try {
        const next = new Map<number, number>();
        for (const [line, addr] of entries) {
          const bytes = await wb.debug.readMemory(addr, 1);
          if (cancelled) return;
          next.set(line, bytes[0] ?? 0);
        }
        if (!cancelled) setValues(next);
      } catch {
        // Backend not booted yet — leave the last values, the next event retries.
      }
    };

    void refresh();
    const offs = [
      wb.events.on("debug:step-done", () => void refresh()),
      wb.events.on("debug:bp-hit", () => void refresh()),
      wb.events.on("run:state", (p) => {
        if (p.status === "paused" || p.status === "loaded") void refresh();
        else if (p.status === "idle") setValues(EMPTY);
      }),
    ];
    return () => {
      cancelled = true;
      for (const off of offs) off();
    };
  }, [wb, equates]);

  return values;
}
