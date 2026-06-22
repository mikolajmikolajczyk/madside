import { useEffect, useMemo, useState } from 'react'
import type { DebugInfo, PanelContext } from '@ports'
import { hex } from '@core/hex'
import { decodeValue, typeLabel } from './decode'
import './VariablesPanel.css'

// Variables panel (#121). When the build supplies a typed-symbol model (#130,
// ADR-0011 DebugInfo — cc65 C today) each global shows its type + decoded live
// value; otherwise it falls back to the raw symbol table (phase 1, asm/untyped).
// Agnostic: reads the @ports DebugType model, never a language package.

interface VariablesUiData {
  labels?: Map<string, number>
  debugInfo?: DebugInfo
}

const MAX_ROWS = 500

export function VariablesPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.variables as VariablesUiData | undefined) ?? null
  const symbols = data?.debugInfo?.symbols
  if (symbols && symbols.length > 0) return <TypedVars ctx={ctx} symbols={symbols} />
  return <RawVars ctx={ctx} labels={data?.labels} />
}

// ── Typed view (#130) ────────────────────────────────────────────────────────
function TypedVars({ ctx, symbols }: { ctx: PanelContext; symbols: DebugInfo['symbols'] }) {
  const [filter, setFilter] = useState('')
  const [values, setValues] = useState<Map<string, Uint8Array>>(new Map())

  const entries = useMemo(() => [...symbols].sort((a, b) => a.name.localeCompare(b.name)), [symbols])
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (f ? entries.filter((s) => s.name.toLowerCase().includes(f)) : entries).slice(0, MAX_ROWS)
  }, [entries, filter])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target() || shown.length === 0) return
      try {
        const next = new Map<string, Uint8Array>()
        await Promise.all(
          shown.map(async (s) => {
            // Read the leaf bytes (scalars/pointers); aggregates show their shape.
            const len = Math.min(s.type.bytes || 1, 8)
            const b = await ctx.debug.readMemory(s.location.addr, len)
            if (b) next.set(s.name, b)
          }),
        )
        if (!cancelled) setValues(next)
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
    return () => { cancelled = true; for (const off of offs) off() }
  }, [ctx.debug, ctx.events, shown])

  return (
    <div className="debug__panel">
      <Header filter={filter} setFilter={setFilter} />
      <div className="vars__rows">
        {shown.map((s) => {
          const b = values.get(s.name)
          const aggregate = s.type.kind === 'struct' || s.type.kind === 'union' || s.type.kind === 'array'
          const val = aggregate ? '{…}' : b ? (decodeValue(b, s.type) ?? '··') : '··'
          return (
            <div className="vars__row" key={s.name} title={`${s.name} @ $${hex(s.location.addr, 4)}`}>
              <span className="vars__name">{s.name}</span>
              <span className="vars__type">{typeLabel(s.type)}</span>
              <span className="vars__val">{val}</span>
            </div>
          )
        })}
        {entries.length > shown.length && (
          <div className="vars__more">… {entries.length - shown.length} more (filter to narrow)</div>
        )}
      </div>
    </div>
  )
}

// ── Raw view (phase 1 — asm / no type info) ─────────────────────────────────
function RawVars({ ctx, labels }: { ctx: PanelContext; labels?: Map<string, number> }) {
  const [filter, setFilter] = useState('')
  const [values, setValues] = useState<Map<number, Uint8Array>>(new Map())

  const entries = useMemo(
    () => (labels ? [...labels.entries()].sort((a, b) => a[0].localeCompare(b[0])) : []),
    [labels],
  )
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return (f ? entries.filter(([n]) => n.toLowerCase().includes(f)) : entries).slice(0, MAX_ROWS)
  }, [entries, filter])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target() || shown.length === 0) return
      try {
        const next = new Map<number, Uint8Array>()
        await Promise.all(shown.map(async ([, addr]) => {
          const b = await ctx.debug.readMemory(addr, 2)
          if (b) next.set(addr, b)
        }))
        if (!cancelled) setValues(next)
      } catch { /* not booted */ }
    }
    void refresh()
    const offs = [
      ctx.events.on('debug:step-done', () => void refresh()),
      ctx.events.on('debug:bp-hit', () => void refresh()),
      ctx.events.on('run:state', (p) => { if (p.status === 'paused' || p.status === 'loaded') void refresh() }),
    ]
    return () => { cancelled = true; for (const off of offs) off() }
  }, [ctx.debug, ctx.events, shown])

  return (
    <div className="debug__panel">
      <Header filter={filter} setFilter={setFilter} />
      {entries.length === 0 ? (
        <div className="vars__empty">(no symbols — build first)</div>
      ) : (
        <div className="vars__rows">
          {shown.map(([name, addr]) => {
            const b = values.get(addr)
            const byte = b && b.length >= 1 ? hex(b[0], 2) : '··'
            const word = b && b.length >= 2 ? hex(b[0] | (b[1] << 8), 4) : '····'
            return (
              <div className="vars__row" key={name} title={`${name} @ $${hex(addr, 4)}`}>
                <span className="vars__name">{name}</span>
                <span className="vars__addr">${hex(addr, 4)}</span>
                <span className="vars__val">${byte}</span>
                <span className="vars__val vars__val--word">${word}</span>
              </div>
            )
          })}
          {entries.length > shown.length && (
            <div className="vars__more">… {entries.length - shown.length} more (filter to narrow)</div>
          )}
        </div>
      )}
    </div>
  )
}

function Header({ filter, setFilter }: { filter: string; setFilter: (s: string) => void }) {
  return (
    <div className="debug__title label">
      <span>Variables</span>
      <input
        className="vars__filter"
        placeholder="filter…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
