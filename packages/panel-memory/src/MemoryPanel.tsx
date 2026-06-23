import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { MemoryRegion, PanelContext } from '@ports'
import { hex } from '@core/hex'
import './MemoryPanel.css'

const ROW = 16
// Fallback row height (px) before a row is measured, and a sane upper bound on
// rows so a very tall panel can't request a huge readMemory.
const FALLBACK_ROW_H = 15
const MAX_ROWS = 4096 / ROW
// Pixels per row stepped — accumulated so wheel + trackpad + touch-drag match.
const WHEEL_PX_PER_ROW = 24
const TOUCH_PX_PER_ROW = 20

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
  const memoryMap = ctx.machine.memoryMap
  // Address ceiling from the machine's memory map (#133/88A) — width-aware, not a
  // hard 0xffff, so a >64K target navigates its full space. Mirrored into a ref so
  // the scroll listener reads it without re-binding mid-drag.
  const addrMax = useMemo(() => memoryMap.reduce((m, r) => Math.max(m, r.end), 0xffff), [memoryMap])
  const addrMaxRef = useRef(addrMax)
  useEffect(() => { addrMaxRef.current = addrMax }, [addrMax])
  const [bytes, setBytes] = useState<Uint8Array>(new Uint8Array(0))

  // Rows are derived from the panel's available height (#119), not a constant.
  // The measured count drives both how many rows render and how many bytes we
  // fetch, so the dump fills the panel however tall it's docked/resized.
  const viewRef = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(8)
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = () => {
      const row = el.querySelector('.memview__row') as HTMLElement | null
      const rowH = row?.offsetHeight || FALLBACK_ROW_H
      const n = Math.max(1, Math.min(MAX_ROWS, Math.floor(el.clientHeight / rowH)))
      setRowCount((prev) => (prev === n ? prev : n))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bytes])

  const length = data?.length ?? rowCount * ROW

  // Scroll the view through memory: wheel + touch-drag walk `base` a row at a
  // time (#119). Accumulated by pixels so mouse / trackpad / finger match.
  // Routed through onBaseChange, so it also disengages cursor-follow. Native
  // non-passive listeners — React's handlers are passive, so preventDefault
  // (stop the page/dock from scrolling) wouldn't take. `base` is read via a ref
  // so a continuous touch drag isn't broken by the effect re-binding each step.
  const baseRef = useRef(base)
  useEffect(() => { baseRef.current = base }, [base])
  const scrollAccum = useRef(0)
  useEffect(() => {
    const el = viewRef.current
    if (!el || !onBaseChange) return
    const walk = (deltaPx: number, pxPerRow: number) => {
      scrollAccum.current += deltaPx
      const step = Math.trunc(scrollAccum.current / pxPerRow)
      if (step === 0) return
      scrollAccum.current -= step * pxPerRow
      const cur = baseRef.current
      const next = Math.max(0, Math.min(addrMaxRef.current, cur + step * ROW))
      if (next !== cur) onBaseChange(next)
    }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); walk(e.deltaY, WHEEL_PX_PER_ROW) }
    // Touch-drag: finger up (clientY decreases) reveals higher addresses.
    let touchY: number | null = null
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null; scrollAccum.current = 0 }
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return
      const y = e.touches[0]?.clientY ?? touchY
      e.preventDefault()
      walk(touchY - y, TOUCH_PX_PER_ROW)
      touchY = y
    }
    const onTouchEnd = () => { touchY = null }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onBaseChange])

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
        <BaseInput value={base} onChange={onBaseChange} addrMax={addrMax} />
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
        viewRef={viewRef}
        maxRows={rowCount}
        base={base}
        bytes={bytes}
        highlightStart={data?.highlightStart}
        highlightLen={data?.highlightLen}
        memoryMap={memoryMap}
      />
    </div>
  )
}

function BaseInput({ value, onChange, addrMax }: { value: number; onChange?: (addr: number) => void; addrMax: number }) {
  // Hex width follows the address ceiling (#133/88A): 4 digits at ≤64K, 6 at 24-bit.
  const digits = Math.max(4, addrMax.toString(16).length)
  const [text, setText] = useState(() => hex(value, digits))
  // Reset the editable text when the base address changes externally (cursor
  // follow). Adjust-during-render with a previous-value marker — the React-
  // recommended alternative to a sync setState in an effect (#28); keeps input
  // focus, which a `key` reset would drop.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(hex(value, digits))
  }
  const commit = (s: string) => {
    const n = parseInt(s, 16)
    if (!isNaN(n)) onChange?.(Math.max(0, Math.min(addrMax, n)))
    else setText(hex(value, digits))
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

function MemoryView({ viewRef, maxRows, base, bytes, highlightStart, highlightLen, memoryMap }:
    { viewRef: React.RefObject<HTMLDivElement | null>; maxRows: number; base: number; bytes: Uint8Array; highlightStart?: number; highlightLen?: number; memoryMap?: readonly MemoryRegion[] }) {
  const regionAt = useMemo(() => {
    const map = memoryMap ?? []
    return (addr: number): MemoryRegion | undefined =>
      map.find((r) => addr >= r.start && addr <= r.end)
  }, [memoryMap])

  if (bytes.length === 0) {
    return <div ref={viewRef} className="memview">(empty — load .xex)</div>
  }
  const hi0 = highlightStart ?? -1
  const hi1 = hi0 + (highlightLen ?? 0)
  const isHi = (addr: number) => hi0 >= 0 && addr >= hi0 && addr < hi1

  const rows: React.ReactNode[] = []
  for (let i = 0; i < Math.min(bytes.length, ROW * maxRows); i += ROW) {
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
  return <div ref={viewRef} className="memview">{rows}</div>
}
