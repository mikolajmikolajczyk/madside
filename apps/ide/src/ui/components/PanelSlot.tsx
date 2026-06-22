import { useEffect, useRef, useState } from 'react'
import type { PanelContext, PanelFile, PanelPlugin, ProjectManifestV2 } from '@ports'
import { useWorkbench } from '@app'
import { useActiveMachine } from '../hooks/useActiveMachine'
import { Boundary } from './ui/Boundary'
import './debug/panel-styles.css'

interface Props {
  panel: PanelPlugin
  projectId: string
  manifest: ProjectManifestV2
  data: PanelContext['data']
  /** Set when the panel is mounted in file-editor mode (Phase 11 path). */
  file?: PanelFile
}

/** Slot host for a single PanelPlugin. Wraps the panel in a Level-2 error
 *  boundary (ADR-0004): a panel crash shows just that panel broken with Retry,
 *  while the rest of the workbench keeps working. Retry remounts the body
 *  (re-running the vanilla mount), so a transient failure recovers cleanly. */
export function PanelSlot(props: Props) {
  const machine = useActiveMachine()
  const [retry, setRetry] = useState(0)

  if (props.panel.supports && !props.panel.supports(machine)) return null

  return (
    <Boundary
      level="panel"
      label={props.panel.title ?? props.panel.id}
      onReset={() => setRetry((r) => r + 1)}
    >
      <PanelBody key={retry} {...props} />
    </Boundary>
  )
}

/** The actual panel render + vanilla-mount lifecycle. Split out so the boundary
 *  can remount it on Retry by bumping its key.
 *
 *  - React `Component` — built-in panels (panel-registers etc.).
 *  - vanilla `mount(container, ctx)` — sandboxed Phase 11 editors loaded via
 *    Blob URL. The host gives the plugin a DOM container; the plugin returns
 *    a destroy callback that fires on unmount. */
function PanelBody({ panel, projectId, manifest, data, file }: Props) {
  const workbench = useWorkbench()
  const machine = useActiveMachine()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const ctx: PanelContext = {
    events: workbench.events,
    commands: workbench.commands,
    debug: workbench.debug,
    project: { id: projectId, manifest },
    machine,
    data,
    file,
  }

  // Vanilla mount path. Keep the effect deps lean — remounting on every
  // ctx.data tick would defeat external plugins that hold internal state.
  useEffect(() => {
    if (!panel.mount) return
    const el = containerRef.current
    if (!el) return
    const handle = panel.mount(el, ctx)
    return () => { handle.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, projectId, file?.path])

  if (panel.mount) {
    return <div ref={containerRef} className="panel-slot panel-slot--mount" />
  }
  const Component = panel.Component
  return <Component ctx={ctx} />
}
