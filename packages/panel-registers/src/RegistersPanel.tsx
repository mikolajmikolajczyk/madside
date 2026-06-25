import { useEffect, useState } from 'react'
import type { FlagState, PanelContext, RegState } from '@ports'
import { hex } from '@core/hex'
import './RegistersPanel.css'

interface CpuSnapshot {
  regs: RegState
  flags: FlagState
}

/** Subscribes to debug:step-done + debug:bp-hit + run:state and pulls fresh
 *  register / flag snapshots from DebugService. Descriptors come from the
 *  active DebugAdapter so the panel renders identically across 6502 machines
 *  (Atari today, NES at M9). */
export function RegistersPanel({ ctx }: { ctx: PanelContext }) {
  const [cpu, setCpu] = useState<CpuSnapshot | null>(null)
  // The focused CPU is reactive state, not just an inline read — switching it
  // (or a focus change driven elsewhere) must re-render the panel so the CPU
  // tab highlight + the register descriptors below both reflect the new CPU.
  const [focused, setFocused] = useState<string | null>(() => ctx.debug.focusedCpu())

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      setFocused(ctx.debug.focusedCpu())
      if (!ctx.debug.target()) return
      try {
        const [regs, flagState] = await Promise.all([ctx.debug.registers(), ctx.debug.flags()])
        if (!cancelled) setCpu({ regs, flags: flagState })
      } catch {
        // Backend not booted yet — re-fired on next event.
      }
    }
    void refresh()
    const offs = [
      // setFocusedCpu emits debug:step-done, so this also re-syncs the highlight.
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
  }, [ctx.debug, ctx.events])

  const target = ctx.debug.target()
  const registers = target?.registers ?? []
  const flags = target?.flags ?? []
  const regsVals = cpu?.regs ?? {}
  const flagState = cpu?.flags ?? {}

  // Multi-CPU machines (Genesis 68000 + Z80) get a CPU switch: picking one routes
  // the registers + memory + current-line through that CPU (#147 Phase 2). The
  // primary CPU focuses as null; an aux CPU by its id.
  const cpus = ctx.machine.cpus ?? []

  return (
    <div className="debug__panel">
      {cpus.length > 1 && (
        <div className="debug__cpuTabs">
          {cpus.map((c) => {
            const id = c.aux ? c.id : null
            return (
              <button
                key={c.id}
                type="button"
                className={'debug__cpuTab' + (focused === id ? ' is-active' : '')}
                onClick={() => { ctx.debug.setFocusedCpu(id); setFocused(id) }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="debug__title label">Registers</div>
      <div className="debug__rows">
        {registers.map((d) => {
          const v = regsVals[d.id] ?? 0
          const hexLen = d.width * 2
          const val = d.width === 2 ? '$' + hex(v, hexLen) : hex(v, hexLen)
          return (
            <div key={d.id} className="reg">
              <span className="reg__label">{d.label}</span>
              <span className="reg__val">{val}</span>
            </div>
          )
        })}
      </div>
      <div className="debug__title label">Flags</div>
      <div className="debug__flags">
        {flags.map((d) => (
          <span key={d.id} className={'flag' + (flagState[d.id] ? ' flag--on' : '')}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
