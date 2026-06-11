import { useEffect, useState } from 'react'
import type { PanelContext } from '@ports'
import './Output.css'

interface OutputState {
  stdout: string
  stderr: string
  ok: boolean | null
}

const EMPTY: OutputState = { stdout: '', stderr: '', ok: null }

/** Subscribes to build:done + build:error directly. ctx.data.output fallback
 *  is honoured so App.tsx can still seed initial state on project load. */
export function OutputPanel({ ctx }: { ctx: PanelContext }) {
  const initial = (ctx.data.output as OutputState | undefined) ?? EMPTY
  const [state, setState] = useState<OutputState>(initial)

  useEffect(() => {
    const offs = [
      ctx.events.on('build:done', (p) => {
        setState({ stdout: p.result.stdout, stderr: p.result.stderr, ok: true })
      }),
      ctx.events.on('build:error', (p) => {
        setState((s) => ({ stdout: s.stdout, stderr: p.message, ok: false }))
      }),
    ]
    return () => { for (const off of offs) off() }
  }, [ctx.events])

  const tag = state.ok === null ? '—' : state.ok ? 'OK' : 'ERR'
  const tagClass = state.ok === null ? '' : state.ok ? 'output__tag--ok' : 'output__tag--err'
  return (
    <div className="output">
      <div className="output__header">
        <span className="label">Output</span>
        <span className={'output__tag ' + tagClass}>{tag}</span>
      </div>
      <pre className="output__body">{[state.stdout, state.stderr].filter(Boolean).join('\n') || '(no output)'}</pre>
    </div>
  )
}
