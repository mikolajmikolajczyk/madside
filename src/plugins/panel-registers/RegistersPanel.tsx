import type { PanelContext } from '@ports'
import { hex } from '@core/hex'

interface CpuSnapshot {
  regs: Record<string, number>
  flags: Record<string, boolean>
}

/** Internal renderer. Consumes ctx.debug.target() for descriptors so the
 *  panel renders identically across any DebugAdapter (Atari 6502 ships
 *  today; NES 6502 reuses the same MOS6502_* tables). */
export function RegistersPanel({ ctx }: { ctx: PanelContext }) {
  const target = ctx.debug.target()
  const registers = target?.registers ?? []
  const flags = target?.flags ?? []
  const cpu = (ctx.data.cpu as CpuSnapshot | null | undefined) ?? null
  const regs = cpu?.regs ?? {}
  const flagState = cpu?.flags ?? {}

  return (
    <div className="debug__panel">
      <div className="debug__title label">Registers</div>
      <div className="debug__rows">
        {registers.map((d) => {
          const v = regs[d.id] ?? 0
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
