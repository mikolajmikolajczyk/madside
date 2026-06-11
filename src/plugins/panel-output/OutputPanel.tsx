import type { PanelContext } from '@ports'
import './Output.css'

interface OutputData {
  stdout: string
  stderr: string
  ok: boolean | null
}

export function OutputPanel({ ctx }: { ctx: PanelContext }) {
  const data = (ctx.data.output as OutputData | undefined) ?? null
  const stdout = data?.stdout ?? ''
  const stderr = data?.stderr ?? ''
  const ok = data?.ok ?? null
  const tag = ok === null ? '—' : ok ? 'OK' : 'ERR'
  const tagClass = ok === null ? '' : ok ? 'output__tag--ok' : 'output__tag--err'
  return (
    <div className="output">
      <div className="output__header">
        <span className="label">Output</span>
        <span className={'output__tag ' + tagClass}>{tag}</span>
      </div>
      <pre className="output__body">{[stdout, stderr].filter(Boolean).join('\n') || '(no output)'}</pre>
    </div>
  )
}
