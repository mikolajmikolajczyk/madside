import React, { useEffect, useMemo, useState } from 'react'
import type { MemoryRegion, PanelContext } from '@ports'
import { hex } from '@core/hex'

interface MemoryUiData {
  base: number
  onBaseChange?: (addr: number) => void
  highlightStart?: number
  highlightLen?: number
  /** Bytes to fetch on each refresh. Defaults to 128. */
  length?: number
  /** True while the panel auto-follows the editor cursor. False after the
   *  user typed a base addr manually. */
  following?: boolean
  /** Click handler the badge wires up to re-engage auto-follow. */
  onResumeFollow?: () => void
}

/** Auto-refreshes on debug:step-done + debug:bp-hit + run:state via
 *  ctx.debug.readMemory. UI state (base, highlight, onBaseChange) still flows
 *  through ctx.data because App.tsx owns the cursor → memBase coupling. */
export function MemoryPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.memory as MemoryUiData | undefined) ?? null
  const base = data?.base ?? 0x2000
  const onBaseChange = data?.onBaseChange
  const length = data?.length ?? 128
  const memoryMap = ctx.machine.memoryMap
  const [bytes, setBytes] = useState<Uint8Array>(new Uint8Array(0))

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target()) return
      try {
        const fresh = await ctx.debug.readMemory(base, length)
        if (!cancelled) setBytes(fresh)
      } catch {
        // Backend not booted yet.
      }
    }
    void refresh()
    const offs = [
      ctx.events.on('debug:step-done', () => void refresh()),
      ctx.events.on('debug:bp-hit', () => void refresh()),
      ctx.events.on('run:state', (p) => {
        if (p.status === 'paused' || p.status === 'loaded') void refresh()
      }),
    ]
    return () => {
      cancelled = true
      for (const off of offs) off()
    }
  }, [ctx.debug, ctx.events, base, length])

  const following = data?.following ?? true
  const onResumeFollow = data?.onResumeFollow

  return (
    <div className="debug__panel debug__panel--memory">
      <div className="debug__title label">
        <span>Memory @</span>
        <BaseInput value={base} onChange={onBaseChange} />
        {!following && onResumeFollow && (
          <button
            type="button"
            className="debug__follow-badge"
            onClick={onResumeFollow}
            title="Re-engage auto-follow on the editor cursor"
          >
            ↺ follow cursor
          </button>
        )}
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
