import React, { useEffect, useMemo, useState } from 'react'
import type { MemoryRegion, PanelContext } from '@ports'
import { hex } from '@core/hex'

interface MemoryData {
  bytes: Uint8Array
  base: number
  onBaseChange?: (addr: number) => void
  highlightStart?: number
  highlightLen?: number
}

export function MemoryPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.memory as MemoryData | undefined) ?? null
  const base = data?.base ?? 0x2000
  const bytes = data?.bytes ?? new Uint8Array(0)
  const onBaseChange = data?.onBaseChange
  const memoryMap = ctx.machine.memoryMap

  return (
    <div className="debug__panel debug__panel--memory">
      <div className="debug__title label">
        <span>Memory @</span>
        <BaseInput value={base} onChange={onBaseChange} />
      </div>
      <MemoryView
        base={base}
        bytes={bytes}
        highlightStart={data?.highlightStart}
        highlightLen={data?.highlightLen}
        memoryMap={memoryMap}
      />
    </div>
  )
}

function BaseInput({ value, onChange }: { value: number; onChange?: (addr: number) => void }) {
  const [text, setText] = useState(hex(value, 4))
  useEffect(() => { setText(hex(value, 4)) }, [value])
  const commit = (s: string) => {
    const n = parseInt(s, 16)
    if (!isNaN(n)) onChange?.(n & 0xffff)
    else setText(hex(value, 4))
  }
  return (
    <input
      className="debug__base"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      spellCheck={false}
      disabled={!onChange}
    />
  )
}

function MemoryView({ base, bytes, highlightStart, highlightLen, memoryMap }:
    { base: number; bytes: Uint8Array; highlightStart?: number; highlightLen?: number; memoryMap?: readonly MemoryRegion[] }) {
  const ROW = 16
  const MAX_ROWS = 8

  const regionAt = useMemo(() => {
    const map = memoryMap ?? []
    return (addr: number): MemoryRegion | undefined =>
      map.find((r) => addr >= r.start && addr <= r.end)
  }, [memoryMap])

  if (bytes.length === 0) return <pre className="memview">(empty — load .xex)</pre>
  const hi0 = highlightStart ?? -1
  const hi1 = hi0 + (highlightLen ?? 0)
  const isHi = (addr: number) => hi0 >= 0 && addr >= hi0 && addr < hi1

  const rows: React.ReactNode[] = []
  for (let i = 0; i < Math.min(bytes.length, ROW * MAX_ROWS); i += ROW) {
    const slice = Array.from(bytes.subarray(i, i + ROW))
    const rowAddr = base + i
    const region = regionAt(rowAddr)
    const regionTitle = region ? `${region.name} (${region.kind})${region.chip ? ` — ${region.chip}` : ''}` : undefined
    const hexCells = slice.map((b, j) => {
      const a = rowAddr + j
      const cls = isHi(a) ? 'memview__cell memview__cell--hi' : 'memview__cell'
      return <span key={j} className={cls}>{hex(b, 2)}</span>
    })
    const ascii = slice.map((b, j) => {
      const a = rowAddr + j
      const ch = b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'
      const cls = isHi(a) ? 'memview__cell memview__cell--hi' : 'memview__cell'
      return <span key={j} className={cls}>{ch}</span>
    })
    rows.push(
      <div key={i} className="memview__row" title={regionTitle}>
        <span className="memview__addr">{hex(rowAddr, 4)}</span>
        {'  '}
        <span className="memview__hex">{hexCells.flatMap((c, k) => k === 0 ? [c] : [' ', c])}</span>
        {'  '}
        <span className="memview__ascii">{ascii}</span>
      </div>
    )
  }
  return <div className="memview">{rows}</div>
}
