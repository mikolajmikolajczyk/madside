import React, { useEffect, useMemo, useState } from "react";
import { hex } from "@core/hex";
import type { MemoryRegion } from "@ports";
import { useWorkbench } from "@app";
import "./Debug.css";

export interface CpuState {
  a: number;
  x: number;
  y: number;
  pc: number;
  sp: number;
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean };
}

const EMPTY: CpuState = {
  a: 0, x: 0, y: 0, pc: 0, sp: 0,
  flags: { n: false, v: false, b: false, d: false, i: false, z: false, c: false },
};


interface Props {
  state?: CpuState;
  memory?: Uint8Array;
  memoryBase?: number;
  onMemoryBaseChange?: (addr: number) => void;
  highlightStart?: number;
  highlightLen?: number;
}

export function Debug({ state = EMPTY, memory, memoryBase = 0x2000, onMemoryBaseChange, highlightStart, highlightLen }: Props) {
  const workbench = useWorkbench();
  const memoryMap = workbench.machine.memoryMap;
  return (
    <div className="debug">
      <div className="debug__panel">
        <div className="debug__title label">Registers</div>
        <div className="debug__rows">
          <Reg label="A"  val={hex(state.a, 2)} />
          <Reg label="X"  val={hex(state.x, 2)} />
          <Reg label="Y"  val={hex(state.y, 2)} />
          <Reg label="PC" val={"$" + hex(state.pc, 4)} />
          <Reg label="SP" val={"$" + hex(state.sp, 2)} />
        </div>
      </div>
      <div className="debug__panel">
        <div className="debug__title label">Flags</div>
        <div className="debug__flags">
          {(["n","v","b","d","i","z","c"] as const).map((k) => (
            <span key={k} className={"flag" + (state.flags[k] ? " flag--on" : "")}>
              {k.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="debug__panel debug__panel--memory">
        <div className="debug__title label">
          <span>Memory @</span>
          <BaseInput value={memoryBase} onChange={onMemoryBaseChange} />
        </div>
        <MemoryView
          base={memoryBase}
          bytes={memory ?? new Uint8Array(0)}
          highlightStart={highlightStart}
          highlightLen={highlightLen}
          memoryMap={memoryMap}
        />
      </div>
    </div>
  );
}

function Reg({ label, val }: { label: string; val: string }) {
  return (
    <div className="reg">
      <span className="reg__label">{label}</span>
      <span className="reg__val">{val}</span>
    </div>
  );
}

function BaseInput({ value, onChange }: { value: number; onChange?: (addr: number) => void }) {
  const [text, setText] = useState(hex(value, 4));
  useEffect(() => { setText(hex(value, 4)); }, [value]);
  const commit = (s: string) => {
    const n = parseInt(s, 16);
    if (!isNaN(n)) onChange?.(n & 0xffff);
    else setText(hex(value, 4));
  };
  return (
    <input
      className="debug__base"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      spellCheck={false}
      disabled={!onChange}
    />
  );
}

function MemoryView({ base, bytes, highlightStart, highlightLen, memoryMap }:
    { base: number; bytes: Uint8Array; highlightStart?: number; highlightLen?: number; memoryMap?: readonly MemoryRegion[] }) {
  const ROW = 16;
  const MAX_ROWS = 8;

  // Region lookup — first region whose [start,end] contains addr. Memoised
  // because MemoryView re-renders frequently and memoryMap is stable.
  const regionAt = useMemo(() => {
    const map = memoryMap ?? [];
    return (addr: number): MemoryRegion | undefined =>
      map.find((r) => addr >= r.start && addr <= r.end);
  }, [memoryMap]);

  if (bytes.length === 0) return <pre className="memview">(empty — load .xex)</pre>;
  const hi0 = highlightStart ?? -1;
  const hi1 = hi0 + (highlightLen ?? 0);
  const isHi = (addr: number) => hi0 >= 0 && addr >= hi0 && addr < hi1;

  const rows: React.ReactNode[] = [];
  for (let i = 0; i < Math.min(bytes.length, ROW * MAX_ROWS); i += ROW) {
    const slice = Array.from(bytes.subarray(i, i + ROW));
    const rowAddr = base + i;
    const region = regionAt(rowAddr);
    const regionTitle = region ? `${region.name} (${region.kind})${region.chip ? ` — ${region.chip}` : ""}` : undefined;
    const hexCells = slice.map((b, j) => {
      const a = rowAddr + j;
      const cls = isHi(a) ? "memview__cell memview__cell--hi" : "memview__cell";
      return <span key={j} className={cls}>{hex(b, 2)}</span>;
    });
    const ascii = slice.map((b, j) => {
      const a = rowAddr + j;
      const ch = b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
      const cls = isHi(a) ? "memview__cell memview__cell--hi" : "memview__cell";
      return <span key={j} className={cls}>{ch}</span>;
    });
    rows.push(
      <div key={i} className="memview__row" title={regionTitle}>
        <span className="memview__addr">{hex(rowAddr, 4)}</span>
        {"  "}
        <span className="memview__hex">{hexCells.flatMap((c, k) => k === 0 ? [c] : [" ", c])}</span>
        {"  "}
        <span className="memview__ascii">{ascii}</span>
      </div>
    );
  }
  return <div className="memview">{rows}</div>;
}
