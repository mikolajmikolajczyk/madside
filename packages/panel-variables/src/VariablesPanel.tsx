import { useEffect, useMemo, useState } from 'react'
import type { PanelContext } from '@ports'
import { hex } from '@core/hex'
import './VariablesPanel.css'

// Variables panel (#121, phase 1). A flat list of global symbols + their live
// value, read straight from the assembled symbol table (`result.labels` →
// ctx.data.variables) and ctx.debug.readMemory. Machine-agnostic — every
// toolchain emits name→address labels. Types / struct trees / locals are later
// phases; here a symbol shows its raw byte + 16-bit LE word.

interface VariablesUiData {
  /** Assembled symbol table: name → address. */
  labels?: Map<string, number>
}

const MAX_ROWS = 500

export function VariablesPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.variables as VariablesUiData | undefined) ?? null
  const labels = data?.labels
  const [filter, setFilter] = useState('')
  const [values, setValues] = useState<Map<number, Uint8Array>>(new Map())

  const entries = useMemo(
    () => (labels ? [...labels.entries()].sort((a, b) => a[0].localeCompare(b[0])) : []),
    [labels],
  )
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const matched = f ? entries.filter(([n]) => n.toLowerCase().includes(f)) : entries
    return matched.slice(0, MAX_ROWS)
  }, [entries, filter])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target() || shown.length === 0) return
      try {
        const next = new Map<number, Uint8Array>()
        await Promise.all(
          shown.map(async ([, addr]) => {
            const bytes = await ctx.debug.readMemory(addr, 2)
            if (bytes) next.set(addr, bytes)
          }),
        )
        if (!cancelled) setValues(next)
      } catch {
        // Backend not booted yet — re-fired on the next event.
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
  }, [ctx.debug, ctx.events, shown])

  return (
    <div className="debug__panel">
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
      {!labels || entries.length === 0 ? (
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
