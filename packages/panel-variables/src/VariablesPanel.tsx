import { useEffect, useMemo, useState } from 'react'
import type { DebugInfo, DebugType, PanelContext } from '@ports'
import { hex } from '@core/hex'
import { childNodes, decodeValue, isExpandable, pointerTarget, typeLabel } from './decode'
import { evalWatch, type ReadMem } from './watch-eval'
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
const MAX_READ = 512 // cap bytes read per symbol (arrays cap elements separately)
const MAX_DEPTH = 6 // pointer-deref depth guard (cycles)

export function VariablesPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.variables as VariablesUiData | undefined) ?? null
  const di = data?.debugInfo
  if (di && ((di.symbols && di.symbols.length > 0) || (di.scopes && di.scopes.length > 0))) {
    return <TypedVars ctx={ctx} symbols={di.symbols} scopes={di.scopes} />
  }
  return <RawVars ctx={ctx} labels={data?.labels} />
}

const watchKey = (pid: string) => `madside.watch.${pid}`
function loadWatches(pid: string): string[] {
  try { return JSON.parse(localStorage.getItem(watchKey(pid)) ?? '[]') as string[] } catch { return [] }
}

// ── Typed view (#130) — expandable tree over the DebugInfo type model ────────
function TypedVars({ ctx, symbols, scopes }: { ctx: PanelContext; symbols: DebugInfo['symbols']; scopes?: DebugInfo['scopes'] }) {
  const [filter, setFilter] = useState('')
  const [values, setValues] = useState<Map<string, Uint8Array>>(new Map())
  // Bumped on every debug event so expanded pointer-deref rows re-read too.
  const [tick, setTick] = useState(0)

  // Watch expressions (#132) — persisted per project.
  const projectId = ctx.project.id
  const [watches, setWatches] = useState<string[]>(() => loadWatches(projectId))
  const [draft, setDraft] = useState('')
  const setWatchList = (next: string[]) => {
    setWatches(next)
    localStorage.setItem(watchKey(projectId), JSON.stringify(next))
  }
  const addWatch = () => {
    const e = draft.trim()
    if (e && !watches.includes(e)) setWatchList([...watches, e])
    setDraft('')
  }

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
            // Read the symbol's whole region once; children slice it by offset.
            const b = await ctx.debug.readMemory(s.location.addr, Math.min(s.type.bytes || 1, MAX_READ))
            if (b) next.set(s.name, b)
          }),
        )
        if (!cancelled) { setValues(next); setTick((t) => t + 1) }
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
      <div className="vars__watchbar">
        <input
          className="vars__filter"
          placeholder="+ watch (e.g. pos.x, *ptr, arr[3])"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addWatch() }}
          spellCheck={false}
        />
      </div>
      <div className="vars__rows">
        {watches.map((expr) => (
          <WatchRow key={expr} ctx={ctx} tick={tick} expr={expr} symbols={symbols} onRemove={() => setWatchList(watches.filter((w) => w !== expr))} />
        ))}
        {watches.length > 0 && <div className="vars__sep" />}
        {scopes && scopes.length > 0 && <LocalsSection ctx={ctx} scopes={scopes} />}
        {shown.map((s) => {
          const b = values.get(s.name)
          if (!b) return null
          return <VarRow key={s.name} ctx={ctx} tick={tick} depth={0} name={s.name} type={s.type} bytes={b} addr={s.location.addr} />
        })}
        {entries.length > shown.length && (
          <div className="vars__more">… {entries.length - shown.length} more (filter to narrow)</div>
        )}
      </div>
    </div>
  )
}

// ── Locals (#136) — the current stack frame's variables ──────────────────────
// Picks the scope whose PC range covers the live PC, resolves the frame base from
// its DebugFrame (sccz80: the IX register; cc65-style memptr: a word in memory),
// and renders each local at base + offset through the same typed VarRow tree.
function LocalsSection({ ctx, scopes }: { ctx: PanelContext; scopes: NonNullable<DebugInfo['scopes']> }) {
  const [tick, setTick] = useState(0)
  const [frame, setFrame] = useState<{ name: string; base: number; locals: { name: string; type: DebugType; bytes: Uint8Array; addr: number }[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target()) return
      try {
        const regs = await ctx.debug.registers()
        const pc = regs.pc ?? 0
        const scope = scopes.find((s) => pc >= s.pc.start && pc < s.pc.end)
        if (!scope) { if (!cancelled) setFrame(null); return }
        // Resolve the frame base from the scope's frame model.
        let base: number
        if (scope.frame.kind === 'reg') {
          base = regs[scope.frame.reg] ?? 0
        } else {
          const w = await ctx.debug.readMemory(scope.frame.addr, scope.frame.bytes, scope.frame.space)
          base = scope.frame.endian === 'le'
            ? w.reduce((a, b, i) => a | (b << (8 * i)), 0)
            : w.reduce((a, b) => (a << 8) | b, 0)
        }
        const locals = await Promise.all(scope.locals.map(async (l) => {
          const addr = (base + l.offset) & 0xffff
          const bytes = await ctx.debug.readMemory(addr, Math.min(l.type.bytes || 1, MAX_READ))
          return { name: l.name, type: l.type, bytes: bytes ?? new Uint8Array(), addr }
        }))
        if (!cancelled) { setFrame({ name: scope.name, base, locals }); setTick((t) => t + 1) }
      } catch {
        // Not booted / running at speed (no stable PC) — clear.
        if (!cancelled) setFrame(null)
      }
    }
    void refresh()
    const offs = [
      ctx.events.on('debug:step-done', () => void refresh()),
      ctx.events.on('debug:bp-hit', () => void refresh()),
      ctx.events.on('run:state', (p) => { if (p.status === 'paused' || p.status === 'loaded') void refresh() }),
    ]
    return () => { cancelled = true; for (const off of offs) off() }
  }, [ctx.debug, ctx.events, scopes])

  if (!frame) return null
  return (
    <>
      <div className="vars__scope" title={`frame @ $${hex(frame.base, 4)}`}>{frame.name}()</div>
      {frame.locals.map((l) => (
        <VarRow key={l.name} ctx={ctx} tick={tick} depth={0} name={l.name} type={l.type} bytes={l.bytes} addr={l.addr} />
      ))}
      <div className="vars__sep" />
    </>
  )
}

interface VarRowProps {
  ctx: PanelContext
  tick: number
  depth: number
  name: string
  type: DebugType
  bytes: Uint8Array
  addr: number
  /** When set, the row shows a remove (✕) action — used for watch roots. */
  onRemove?: () => void
}

function VarRow({ ctx, tick, depth, name, type, bytes, addr, onRemove }: VarRowProps) {
  const [open, setOpen] = useState(false)
  const expandable = isExpandable(type) && depth < MAX_DEPTH
  const isPtr = type.kind === 'pointer'

  // Value: leaf decoded; pointer = its address; aggregate = a shape hint.
  const value =
    type.kind === 'struct' || type.kind === 'union' ? '{…}'
    : type.kind === 'array' ? `[${type.count}]`
    : decodeValue(bytes, type) ?? '··'

  // Pointer deref: read the target lazily while open (and on each refresh tick).
  const [deref, setDeref] = useState<Uint8Array | null>(null)
  const target = isPtr ? pointerTarget(bytes, type) : 0
  useEffect(() => {
    if (!isPtr || !open) return
    const to = (type as Extract<DebugType, { kind: 'pointer' }>).to
    let cancelled = false
    void ctx.debug.readMemory(target, Math.min(to.bytes || 1, MAX_READ)).then((b) => {
      if (!cancelled) setDeref(b ?? null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isPtr, open, target, tick, ctx.debug, type])

  const children = !open ? [] : isPtr
    ? (deref && target !== 0
        ? [{ name: `*${name}`, type: (type as Extract<DebugType, { kind: 'pointer' }>).to, bytes: deref, addr: target }]
        : [])
    : childNodes(type, bytes, addr)

  return (
    <>
      <div
        className="vars__row"
        style={{ paddingLeft: 6 + depth * 12 }}
        title={`${name} @ $${hex(addr, 4)}`}
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
        data-expandable={expandable || undefined}
      >
        <span className="vars__caret">{expandable ? (open ? '▾' : '▸') : ''}</span>
        <span className="vars__name">{name}</span>
        <span className="vars__type">{typeLabel(type)}</span>
        <span className="vars__val">{value}</span>
        {onRemove && (
          <button className="vars__x" title="Remove watch" onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</button>
        )}
      </div>
      {children.map((c) => (
        <VarRow key={c.name} ctx={ctx} tick={tick} depth={depth + 1} name={c.name} type={c.type} bytes={c.bytes} addr={c.addr} />
      ))}
    </>
  )
}

// A watch expression (#132): evaluate to a typed location, then render it with
// the same VarRow tree as a global. Re-evaluated on each debug tick.
function WatchRow({ ctx, tick, expr, symbols, onRemove }: {
  ctx: PanelContext; tick: number; expr: string; symbols: DebugInfo['symbols']; onRemove: () => void
}) {
  const [state, setState] = useState<{ type?: DebugType; bytes?: Uint8Array; addr?: number; error?: string }>({})
  useEffect(() => {
    let cancelled = false
    const read: ReadMem = (a, l) => ctx.debug.readMemory(a, l)
    void (async () => {
      const r = await evalWatch(expr, symbols, read)
      if (cancelled) return
      if (!r.ok) { setState({ error: r.error }); return }
      const b = await read(r.node.addr, Math.min(r.node.type.bytes || 1, MAX_READ))
      if (!cancelled) setState({ type: r.node.type, addr: r.node.addr, bytes: b ?? new Uint8Array() })
    })()
    return () => { cancelled = true }
  }, [expr, tick, symbols, ctx.debug])

  if (state.error) {
    return (
      <div className="vars__row vars__row--err" title={state.error}>
        <span className="vars__caret" />
        <span className="vars__name">{expr}</span>
        <span className="vars__val vars__val--err">⚠ {state.error}</span>
        <button className="vars__x" title="Remove watch" onClick={onRemove}>✕</button>
      </div>
    )
  }
  if (!state.type || !state.bytes) return null
  return <VarRow ctx={ctx} tick={tick} depth={0} name={expr} type={state.type} bytes={state.bytes} addr={state.addr ?? 0} onRemove={onRemove} />
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
