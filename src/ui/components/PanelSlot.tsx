import { useEffect, useRef } from 'react'
import type { PanelContext, PanelFile, PanelPlugin, ProjectManifestV2 } from '@ports'
import { useWorkbench } from '@app'

interface Props {
  panel: PanelPlugin
  projectId: string
  manifest: ProjectManifestV2
  data: PanelContext['data']
  /** Set when the panel is mounted in file-editor mode (Phase 11 path). */
  file?: PanelFile
}

/** Slot host for a single PanelPlugin. Handles both render paths:
 *
 *  - React `Component` — built-in panels (panel-registers etc.).
 *  - vanilla `mount(container, ctx)` — sandboxed Phase 11 editors loaded via
 *    Blob URL. The host gives the plugin a DOM container; the plugin returns
 *    a destroy callback that fires on unmount. */
export function PanelSlot({ panel, projectId, manifest, data, file }: Props) {
  const workbench = useWorkbench()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const ctx: PanelContext = {
    events: workbench.events,
    commands: workbench.commands,
    debug: workbench.debug,
    project: { id: projectId, manifest },
    machine: workbench.machine,
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

  if (panel.supports && !panel.supports(workbench.machine)) return null

  if (panel.mount) {
    return <div ref={containerRef} className="panel-slot panel-slot--mount" />
  }
  const Component = panel.Component
  return <Component ctx={ctx} />
}
