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
  const seed = (ctx.data.output as OutputState | undefined) ?? EMPTY
  const [state, setState] = useState<OutputState>(seed)
  // Re-sync when the seed changes identity — App hands a fresh object only on a
  // build or a reload-hydration (#62), so a restored last build shows without
  // waiting for a build:done/error event (which never re-fires after a reload).
  const [prevSeed, setPrevSeed] = useState(seed)
  if (seed !== prevSeed) {
    setPrevSeed(seed)
    setState(seed)
  }

  useEffect(() => {
    const offs = [
      ctx.events.on('build:done', (p) => {
        setState({ stdout: p.result.stdout, stderr: p.result.stderr, ok: true })
      }),
      ctx.events.on('build:error', (p) => {
        // Show the assembler's diagnostics (MADS prints them to stdout; line +
        // message). Fall back to the short summary only when there's no output.
        const detail = [p.stdout, p.stderr].filter(Boolean).join('\n')
        setState({ stdout: '', stderr: detail || p.message, ok: false })
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
